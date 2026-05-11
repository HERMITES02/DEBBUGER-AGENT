import re
from shared.schema import FilePatch

def parse_line_range(diff: str) -> tuple[int, int]:
    """Extract start/end line numbers from unified diff header."""
    match = re.search(r'@@ -(\d+)(?:,(\d+))? \+(\d+)', diff)
    if not match:
        return 1, 1
    start = int(match.group(1))
    count = int(match.group(2) or 1)
    return start, start + count - 1

def extract_new_content(diff: str) -> str:
    """Extract only the added lines from a unified diff."""
    lines = []
    for line in diff.splitlines():
        if line.startswith('+') and not line.startswith('+++'):
            lines.append(line[1:])  # strip the leading +
        elif line.startswith(' '):
            lines.append(line[1:])  # context lines
    return '\n'.join(lines)

async def run_file_agent(
    file_path:  str,
    patch_diff: str,
    confidence: float = 0.8,
) -> FilePatch:
    """
    Build a FilePatch from a unified diff.
    Used by VS Code extension to apply fixes directly.
    """
    start_line, end_line = parse_line_range(patch_diff)
    new_content = extract_new_content(patch_diff)

    return FilePatch(
        file_path=    file_path,
        start_line=   start_line,
        end_line=     end_line,
        new_content=  new_content,
        diff_preview= patch_diff,
        confidence=   confidence,
    )