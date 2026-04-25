# save this as tobase64.py in project root
import base64

with open("test_error.png", "rb") as f:
    result = base64.b64encode(f.read()).decode("utf-8")
    
print(result)