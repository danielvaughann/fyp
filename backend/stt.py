import os
import uuid
import subprocess

from fastapi import File, UploadFile, HTTPException, APIRouter
from faster_whisper import WhisperModel

import shutil
import os

# router for stt endpoints
router = APIRouter()
#small memory effiecient model of faster whisper
model = WhisperModel("tiny", device="cpu", compute_type="int8")

# directory for temporary audio files during processing
TMP_DIR = "temporary_audio"
os.makedirs(TMP_DIR, exist_ok=True)

# path to my ffmpeg
#FFMPEG_PATH = r"C:\Users\User\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe"

FFMPEG_PATH = shutil.which("ffmpeg")
if not FFMPEG_PATH:
    raise RuntimeError(
        "FFmpeg not found"
    )
print("Using FFmpeg:", FFMPEG_PATH)

# convert audio to wav using ffmpeg (best format for whisper)
def convert_to_wav(input_file: str, output_file: str):
    command = [
        FFMPEG_PATH,
        "-i", input_file,
        "-ar", "16000", #16kHz rate for whisper
        "-ac", "1", #1 mono audio channel for whisper
        output_file,
    ]
    #convert using FFmpeg
    conversion = subprocess.run(command, capture_output=True, text=True)
    if conversion.returncode != 0:
        raise Exception(f"FFmpeg conversion failed: {conversion.stderr}")

@router.post("/stt/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    # temporary files paths to store audio
    temp_input_path = os.path.join(TMP_DIR, f"{uuid.uuid4()}_{file.filename}")
    temp_wav_path = os.path.join(TMP_DIR, f"{uuid.uuid4()}.wav")

    # save uploaded file to disk
    with open(temp_input_path, "wb") as buffer:
        buffer.write(await file.read())

    # convert file to wav format
    try:
        convert_to_wav(temp_input_path, temp_wav_path)
        # removes silence
        segments, info = model.transcribe(temp_wav_path, vad_filter=True)

        # combine all segments into a string
        transcript = " ".join([segment.text for segment in segments])

        #return transcript to frontend
        return {"transcript": transcript}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        # cleanup temporary files
        if os.path.exists(temp_input_path):
            os.remove(temp_input_path)
        if os.path.exists(temp_wav_path):
            os.remove(temp_wav_path)