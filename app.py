from flask import Flask, render_template, request, jsonify, redirect, url_for, make_response
from transformers import pipeline
from PyPDF2 import PdfReader
from docx import Document
import datetime
import firebase_admin
from firebase_admin import credentials, auth, firestore
from googletrans import Translator
import nltk
from nltk.tokenize import sent_tokenize
import fitz  # PyMuPDF
import logging
from functools import wraps

# --- Setup ---
nltk.download("punkt")
logging.basicConfig(level=logging.INFO)

cred = credentials.Certificate(r"/Users/aera/Data-Summarizerr/data-summarizerr-firebase-adminsdk-fbsvc-ee977f35db.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# Firebase login_required decorator for API routes
def login_required_api(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        id_token = None
        auth_header = request.headers.get("Authorization", None)
        if auth_header and auth_header.startswith("Bearer "):
            id_token = auth_header.split(" ")[1]

        if not id_token:
            return jsonify({"error": "Missing auth token"}), 401

        try:
            decoded_token = auth.verify_id_token(id_token)
            request.uid = decoded_token["uid"]
        except Exception as e:
            print("Auth error:", e)
            return jsonify({"error": "Invalid token"}), 401

        return f(*args, **kwargs)
    return decorated_function

app = Flask(__name__, template_folder="templates", static_folder="static")
summarizer = pipeline("summarization", model="facebook/bart-large-cnn", device=0)

app.secret_key = '4e5d6aaf24a9a5b045de62109fcb6ee2edb9a9e49fe349aa34663ad3150978f1'

# --- Helpers ---
def chunk_text_by_sentences(text, max_sentences=10):
    sentences = sent_tokenize(text)
    return [" ".join(sentences[i:i+max_sentences]) for i in range(0, len(sentences), max_sentences)]

def extract_text_from_pdf(file):
    try:
        file.seek(0)
        doc = fitz.open(stream=file.read(), filetype="pdf")
        return chunk_text_by_sentences(" ".join(page.get_text() for page in doc))
    except Exception as e:
        logging.error("PDF extraction error: %s", e)
        return [f"Error extracting text: {e}"]

def extract_text_from_docx(file):
    try:
        file.seek(0)
        document = Document(file)
        return " ".join(para.text for para in document.paragraphs)
    except Exception as e:
        logging.error("DOCX extraction error: %s", e)
        return f"Error extracting text from DOCX: {e}"

def extract_text_from_plain(file):
    try:
        return file.read().decode("utf-8", errors="replace")
    except Exception as e:
        logging.error("Plain text extraction error: %s", e)
        return f"Error reading text file: {e}"

def summarize_text(text_chunks, max_length=150, min_length=50):
    try:
        results = summarizer(text_chunks, max_length=max_length, min_length=min_length, do_sample=False, batch_size=4)
        return " ".join(res['summary_text'] for res in results)
    except Exception as e:
        logging.error("Summarization error: %s", e)
        return "Something went wrong while summarizing."

def get_user_uid():
    id_token = request.cookies.get("idToken")
    if not id_token:
        return None
    try:
        return auth.verify_id_token(id_token)["uid"]
    except Exception:
        return None

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        id_token = request.cookies.get("idToken")
        if not id_token:
            return "Unauthorized", 401
        try:
            request.uid = auth.verify_id_token(id_token)["uid"]
        except Exception:
            return "Unauthorized", 401
        return f(*args, **kwargs)
    return decorated_function

def get_user_profile(uid):
    if not uid:
        return {"email": "Guest", "name": "Guest"}
    try:
        user_record = auth.get_user(uid)
        return {"email": user_record.email, "name": user_record.display_name or user_record.email}
    except Exception:
        return {"email": "Unknown", "name": "Unknown"}

def translate_summary(summary, target_language):
    translator = Translator()
    lang_map = {
        "english": "en", "spanish": "es", "french": "fr", "hindi": "hi", "japanese": "ja"
    }
    code = lang_map.get(target_language.lower(), target_language.lower())
    if code != "en":
        try:
            translated = translator.translate(summary, dest=code)
            return translated.text
        except Exception as e:
            logging.error("Translation error: %s", e)
            return "Translation failed."
    return summary

# --- Routes ---
@app.route("/")
def index():
    uid = get_user_uid()
    profile = get_user_profile(uid)
    return render_template("index.html", uid=uid, profile=profile)

@app.route("/summarize", methods=["POST"])
def summarize_endpoint():
    try:
        text_chunks, input_data = [], ""
        file = request.files.get("file")
        raw_text = request.form.get("text")

        if file:
            input_data = f"Uploaded file: {file.filename}"
            ext = file.filename.lower().split('.')[-1]
            if ext == "pdf":
                text_chunks = extract_text_from_pdf(file)
            elif ext == "docx":
                text_chunks = chunk_text_by_sentences(extract_text_from_docx(file))
            else:
                text_chunks = chunk_text_by_sentences(extract_text_from_plain(file))
        elif raw_text:
            input_data = raw_text
            text_chunks = chunk_text_by_sentences(raw_text)
        else:
            return jsonify({"error": "No input provided."}), 400

        summary_length = int(request.form.get("summary_length", 2))
        min_length, max_length = {
            1: (25, 50),
            2: (50, 150),
            3: (100, 300)
        }.get(summary_length, (50, 150))

        summary = summarize_text(text_chunks, max_length=max_length, min_length=min_length)
        mode = request.form.get("mode", "paragraph")

        if mode == "bullet":
            sentences = summary.split('. ')
            summary = "• " + "\n• ".join([s.strip() for s in sentences if s.strip()])
        elif mode == "change_language":
            target_language = request.form.get("target_language", "es")
            summary = translate_summary(summary, target_language)

        uid = get_user_uid()
        if uid:
            db.collection("history").add({
                "uid": uid,
                "input": input_data,
                "summary": summary,
                "mode": mode,
                "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            })

        return jsonify({"summary": summary})
    except Exception as e:
        logging.error("Summarization endpoint error: %s", e)
        return jsonify({"error": "An error occurred during summarization."}), 500

@app.route("/extract_text", methods=["POST"])
def extract_text_endpoint():
    if request.form.get("text"):
        return jsonify({"text": request.form.get("text")})

    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file provided."}), 400

    ext = file.filename.lower().split('.')[-1]
    if ext == "pdf":
        return jsonify({"text": " ".join(extract_text_from_pdf(file))})
    elif ext == "docx":
        return jsonify({"text": extract_text_from_docx(file)})
    else:
        return jsonify({"text": extract_text_from_plain(file)})

@app.route("/history")
@login_required
def history():
    uid = request.uid
    docs = db.collection("history").where("uid", "==", uid).stream()
    history_list = sorted([doc.to_dict() for doc in docs], key=lambda x: x["timestamp"], reverse=True)
    return render_template("history.html", history=history_list, uid=uid)

@app.route("/api/history")
@login_required_api
def api_history():
    uid = request.uid
    docs = db.collection("history").where("uid", "==", uid).stream()

    history_data = []
    for doc in docs:
        d = doc.to_dict()
        d["timestamp"] = d["timestamp"].isoformat()  # Convert to string for JSON
        history_data.append(d)

    # Sort newest first
    history_data.sort(key=lambda x: x["timestamp"], reverse=True)

    return jsonify(history_data)

@app.route("/about")
def about():
    return render_template("about.html", uid=get_user_uid())

@app.route("/contact")
def contact():
    return render_template("contact.html", uid=get_user_uid())

# --- Auth Endpoints ---
@app.route("/api/register", methods=["POST"])
def api_register():
    email = request.form.get("email")
    password = request.form.get("password")
    if not email or not password:
        return jsonify({"error": "Email and password required."}), 400
    try:
        user = auth.create_user(email=email, password=password)
        return jsonify({"success": True, "uid": user.uid})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/login", methods=["POST"])
def api_login():
    id_token = request.json.get("idToken")
    try:
        uid = auth.verify_id_token(id_token)["uid"]
        resp = make_response(jsonify({"success": True, "uid": uid}))
        resp.set_cookie("idToken", id_token, httponly=True, secure=False, path='/', max_age=7*24*60*60)
        return resp
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/logout", methods=["POST"])
def api_logout():
    resp = make_response(jsonify({"success": True}))
    resp.set_cookie("idToken", "", expires=0, path='/')
    return resp
@app.route("/sessionLogin", methods=["POST"])

def session_login():
    try:
        id_token = request.json.get("idToken")
        if not id_token:
            return jsonify({"error": "Missing ID token"}), 400

        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token['uid']

        # Store UID or user info in session
        session["user_id"] = uid
        return jsonify({"message": "Session created"}), 200

    except Exception as e:
        print("Token verification error:", e)
        return jsonify({"error": "Unauthorized"}), 401


# --- Start Server ---
if __name__ == "__main__":
    app.run(debug=True)
