document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM fully loaded.");

  // ===== General Elements =====
  const fileInput = document.getElementById("fileInput");
  const inputText = document.getElementById("inputText");
  const summarizeBtn = document.getElementById("summarize-btn");
  const summaryOutput = document.getElementById("summaryOutput");
  const loader = document.getElementById("loader");
  const summaryLengthSlider = document.getElementById("summaryLengthSlider");
  const languageModal = document.getElementById("languageModal");
  const closeLanguageModal = document.getElementById("closeLanguageModal");
  let selectedMode = "paragraph";

  // ===== Mode Button Functionality =====
  window.setMode = function (mode, elem) {
    document.querySelectorAll(".mode-btn").forEach(button => button.classList.remove("active"));
    elem.classList.add("active");
    selectedMode = mode;
    if (mode === "change_language" && languageModal) {
      languageModal.classList.remove("hidden");
    }
  };

  if (closeLanguageModal) {
    closeLanguageModal.addEventListener("click", function () {
      languageModal.classList.add("hidden");
    });
  }

  // ===== File Upload Handling =====
  if (fileInput) {
    fileInput.addEventListener("change", function () {
      const file = fileInput.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      fetch("/extract_text", { method: "POST", body: formData, credentials: "include" })
        .then(response => response.json())
        .then(data => {
          inputText.value = data.text ? data.text : "Error extracting text from file.";
        })
        .catch(error => {
          console.error("File upload error:", error);
          inputText.value = "Error processing file.";
        });
    });
  }

  // ===== Summarize Button Handling =====
  if (summarizeBtn) {
    summarizeBtn.addEventListener("click", function () {
      const text = inputText.value.trim();
      if (!text && (!fileInput || fileInput.files.length === 0)) {
        alert("Please provide text or upload a file.");
        return;
      }
      const formData = new FormData();
      if (fileInput && fileInput.files.length > 0) {
        formData.append("file", fileInput.files[0]);
      } else {
        formData.append("text", text);
      }
      formData.append("summary_length", summaryLengthSlider.value);
      formData.append("mode", selectedMode);
      if (selectedMode === "change_language") {
        // Ideally, you would get the target language dynamically from the modal.
        formData.append("target_language", "spanish");
      }
      loader.classList.remove("hidden");
      fetch("/summarize", { method: "POST", body: formData, credentials: "include" })
        .then(response => response.json())
        .then(data => {
          loader.classList.add("hidden");
          if (data.summary) {
            summaryOutput.value = data.summary;
            summaryOutput.classList.add("animate-fade-in");
            setTimeout(() => summaryOutput.classList.remove("animate-fade-in"), 1000);
            updateSummaryStats();
          } else if (data.error) {
            summaryOutput.value = "Error: " + data.error;
          } else {
            summaryOutput.value = "Unknown error occurred.";
          }
        })
        .catch(error => {
          loader.classList.add("hidden");
          console.error("Summarization error:", error);
          summaryOutput.value = "Error processing the request.";
        });
    });
  }

  window.clearInput = function () {
    inputText.value = "";
    if (fileInput) fileInput.value = "";
  };

  // ===== Authentication Modal Handling =====
  const authModal = document.getElementById("authModal");
  const openAuth = document.getElementById("openAuth");
  const closeAuth = document.getElementById("closeAuth");
  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const loginError = document.getElementById("loginError");
  const registerError = document.getElementById("registerError");
  const userMenu = document.getElementById("userMenu");

  // Ensure userMenu starts hidden using display property
  if (userMenu) {
    userMenu.style.display = "none";
  }

  if (openAuth) {
    openAuth.addEventListener("click", function (e) {
      console.log("Global openAuth click handler fired. Button text:", openAuth.textContent.trim());
      if (openAuth.textContent.trim() === "Sign In") {
        if (authModal) authModal.classList.remove("hidden");
      } else {
        e.stopPropagation();
        if (userMenu) {
          if (userMenu.classList.contains("hidden")) {
            userMenu.classList.remove("hidden");
            console.log("User menu opened.");
          } else {
            userMenu.classList.add("hidden");
            console.log("User menu closed.");
          }
        }
      }
    });
  }
  

  // Close the dropdown when clicking outside of it.
  document.addEventListener("click", function (e) {
    if (userMenu && e.target !== openAuth && !userMenu.contains(e.target)) {
      userMenu.style.display = "none";
      console.log("User menu closed by outside click.");
    }
  });

  if (closeAuth) {
    closeAuth.addEventListener("click", function () {
      if (authModal) authModal.classList.add("hidden");
      loginError.textContent = "";
      registerError.textContent = "";
      if (loginForm) loginForm.reset();
      if (registerForm) registerForm.reset();
    });
  }

  window.addEventListener("click", function (event) {
    if (event.target === authModal) {
      authModal.classList.add("hidden");
      loginError.textContent = "";
      registerError.textContent = "";
      if (loginForm) loginForm.reset();
      if (registerForm) registerForm.reset();
    }
  });

  if (loginTab && registerTab && loginForm && registerForm) {
    loginTab.addEventListener("click", function () {
      loginTab.classList.add("active");
      registerTab.classList.remove("active");
      loginForm.classList.remove("hidden");
      registerForm.classList.add("hidden");
    });
    registerTab.addEventListener("click", function () {
      registerTab.classList.add("active");
      loginTab.classList.remove("active");
      registerForm.classList.remove("hidden");
      loginForm.classList.add("hidden");
    });
  }

  // ===== Firebase Authentication: State Change Handling =====
  firebase.auth().onAuthStateChanged((user) => {
    if (!userMenu || !openAuth) {
      console.error("Error: userMenu or openAuth element not found in the DOM.");
      return;
    }
    if (user) {
      // Update the openAuth button text to "User"
      openAuth.textContent = "User";
      // Populate the userMenu with user details and a logout button
      userMenu.innerHTML = `
        <p class="px-4 py-2 text-gray-700">Name: ${user.displayName || "Name not set"}</p>
        <p class="px-4 py-2 text-gray-700">Email: ${user.email}</p>
        <button id="logoutBtn" class="block w-full px-4 py-2 text-left hover:bg-gray-100">Logout</button>
      `;
      // Ensure the dropdown is hidden initially
      userMenu.style.display = "none";
      // Attach logout functionality to the logout button
      const logoutBtn = document.getElementById("logoutBtn");
      if (logoutBtn) {
        logoutBtn.onclick = function () {
          firebase.auth().signOut()
            .then(() => {
              // Optionally, notify your backend to clear the session here.
              window.location.reload();
            })
            .catch((error) => console.error("Logout Error:", error));
        };
      }
      // After login, send token to server to create a session.
      user.getIdToken(true).then(function (idToken) {
        fetch('/sessionLogin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ idToken: idToken })
        }).then(res => {
          if (res.ok) {
            console.log("Server session created successfully.");
            // Optionally, fetch history data after authentication.
            fetchHistory();
          } else {
            console.error("Failed to create server session.");
          }
        }).catch(err => console.error("Error during session creation:", err));
      }).catch(function (error) {
        console.error("Error getting ID token:", error);
      });
    } else {
      openAuth.textContent = "Sign In";
      userMenu.innerHTML = "";
      userMenu.style.display = "none";
    }
  });

  // ===== Firebase Authentication: Registration Handling =====
  if (registerForm) {
    registerForm.addEventListener("submit", function (e) {
      e.preventDefault();
      registerError.textContent = "";

      const email = document.getElementById("registerEmail").value;
      const password = document.getElementById("registerPassword").value;
      const confirm = document.getElementById("registerConfirm").value;

      if (password !== confirm) {
        registerError.textContent = "Passwords do not match.";
        return;
      }

      firebase.auth().createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
          console.log("Registration successful:", userCredential);
          registerError.style.color = "green";
          registerError.textContent = "Registration successful! Please sign in.";
          setTimeout(() => {
            loginTab.click();
            registerError.textContent = "";
            registerForm.reset();
          }, 1500);
        })
        .catch((error) => {
          console.error("Firebase registration error:", error);
          registerError.textContent = error.message;
        });
    });
  }

  // ===== Firebase Authentication: Login Handling =====
  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      loginError.textContent = "";
      const email = document.getElementById("loginEmail").value;
      const password = document.getElementById("loginPassword").value;
      firebase.auth().signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
          console.log("Login successful:", userCredential);
          // onAuthStateChanged will handle UI updates and session creation.
        })
        .catch((error) => {
          console.error("Firebase login error:", error);
          loginError.textContent = error.message;
        });
    });
  }

  // ===== Copy to Clipboard =====
  const copyBtn = document.getElementById("copyBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      const summary = summaryOutput.value;
      if (summary) {
        navigator.clipboard.writeText(summary)
          .then(() => alert("Summary copied to clipboard!"))
          .catch(err => alert("Failed to copy text: " + err));
      } else {
        alert("No summary available to copy.");
      }
    });
  }

  // ===== Download Summary =====
  const downloadBtn = document.getElementById("downloadBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", function () {
      const summary = summaryOutput.value;
      if (summary) {
        const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "summary.txt";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert("No summary available to download.");
      }
    });
  }

  // ===== Update Summary Stats =====
  function updateSummaryStats() {
    const summary = summaryOutput.value.trim();
    const words = summary.split(/\s+/).filter(word => word.length > 0);
    const sentences = summary.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0);
    document.getElementById("summaryStats").innerHTML = `${sentences.length} sentences<br>${words.length} words`;
  }

  // ===== Fetch and Display History Data =====
  function fetchHistory() {
    firebase.auth().currentUser?.getIdToken(true)
      .then(idToken => {
        return fetch('/api/history', {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + idToken
          }
        });
      })
      .then(res => res.json())
      .then(data => {
        console.log("User history:", data);
        renderHistory(data);
      })
      .catch(err => {
        console.error("Error fetching history:", err);
      });
  }
  
  function renderHistory(historyData) {
    const container = document.getElementById("history-container");
    if (!container) {
      console.warn("History container not found.");
      return;
    }
  
    container.innerHTML = ""; // Clear previous content
    historyData.forEach(item => {
      const entry = document.createElement("div");
      entry.className = "history-entry border p-4 mb-2 rounded shadow-sm";
      entry.innerHTML = `
        <p><strong>Input:</strong> ${item.input}</p>
        <p><strong>Summary:</strong> ${item.summary}</p>
        <p><strong>Mode:</strong> ${item.mode}</p>
        <p><strong>Time:</strong> ${new Date(item.timestamp).toLocaleString()}</p>
        <hr>
      `;
      container.appendChild(entry);
    });
  }
  
});