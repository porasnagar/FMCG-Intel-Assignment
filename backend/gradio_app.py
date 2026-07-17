import uvicorn
import gradio as gr
from app.main import app


# Create a dummy Gradio interface for Hugging Face
def greet():
    return "FMCG Backend API is running. Visit /docs for the API documentation."

demo = gr.Interface(fn=greet, inputs=[], outputs="text")

# Mount Gradio onto the FastAPI app at the root (so HF Spaces thinks it's a valid Gradio app)
app = gr.mount_gradio_app(app, demo, path="/ui")

# Hugging Face will automatically run the 'app' FastAPI object.
