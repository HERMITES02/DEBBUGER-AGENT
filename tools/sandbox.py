import asyncio
import subprocess
import tempfile
import os
import sys
from dotenv import load_dotenv

load_dotenv()

async def execute_code(code: str, language: str = "python") -> dict:
    """
    Execute code in a subprocess with a 30 second timeout.
    Safe enough for development — swap back to E2B for production.
    """
    try:
        if language.lower() in ("python", "py"):
            return await _run_python(code)
        else:
            return {
                "success":  False,
                "stdout":   "",
                "stderr":   "",
                "error":    f"Language '{language}' not supported yet",
                "language": language,
            }

    except Exception as e:
        return {
            "success":  False,
            "stdout":   "",
            "stderr":   "",
            "error":    f"Executor error: {str(e)}",
            "language": language,
        }

async def _run_python(code: str) -> dict:
    """Write code to a temp file and run it with a timeout."""
    # Write to a temp file so tracebacks show line numbers
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".py",
        delete=False,
        encoding="utf-8"
    ) as f:
        f.write(code)
        tmp_path = f.name

    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, tmp_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(),
                timeout=30.0
            )
        except asyncio.TimeoutError:
            proc.kill()
            return {
                "success":  False,
                "stdout":   "",
                "stderr":   "Execution timed out after 30 seconds",
                "error":    "TimeoutError",
                "language": "python",
            }

        stdout = stdout_bytes.decode("utf-8", errors="replace")
        stderr = stderr_bytes.decode("utf-8", errors="replace")
        success = proc.returncode == 0

        return {
            "success":  success,
            "stdout":   stdout,
            "stderr":   stderr,
            "error":    stderr if not success else None,
            "language": "python",
        }

    finally:
        # Always clean up the temp file
        try:
            os.unlink(tmp_path)
        except OSError:
            pass