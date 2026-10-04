import glob, json, sys
from faster_whisper import WhisperModel

src = glob.glob("media/*.m4a")[0]
model = WhisperModel("medium", device="cpu", compute_type="int8")
segs, info = model.transcribe(src, vad_filter=False, beam_size=5, condition_on_previous_text=False, no_speech_threshold=0.9, language="en")
out = [{"t": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segs if s.text.strip()]
print("lang", info.language, "dur", round(info.duration, 1), file=sys.stderr)
json.dump({"duration": round(info.duration, 2), "lines": out}, open("data/lyrics.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False, indent=1))
