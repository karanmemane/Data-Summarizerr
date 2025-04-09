#!/bin/bash

echo "👑 Starting Deployment - King Mode Activated"

echo "🔥 Removing old virtual environment..."
rm -rf venv

echo "✨ Creating fresh virtual environment..."
python -m venv venv
source venv/bin/activate

echo "🚀 Upgrading pip..."
pip install --upgrade pip

echo "📦 Installing dependencies..."
pip install -r requirements.txt

echo "👑 Setup Complete. Run the app with:"
echo "source venv/bin/activate && python app.py"
