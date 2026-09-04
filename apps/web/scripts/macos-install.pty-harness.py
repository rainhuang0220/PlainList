#!/usr/bin/env python3
"""PTY harness for macos-install.command. Never prints password contents."""
from __future__ import annotations

import json
import os
import pty
import select
import signal
import sys
import time


HELPER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "macos-install.command")
REDACT = ("correct-password", "nope", "bad1", "bad2", "bad3", "hello123", "wrongpass1", "abc123")


def redact(text: str) -> str:
    out = text
    for token in REDACT:
        out = out.replace(token, "<redacted>")
    return out


def main() -> int:
    sends = json.loads(sys.argv[1]) if len(sys.argv) > 1 else []
    parent = os.environ.get("PLAINLIST_PTY_PARENT") == "1"
    eof_on_password = os.environ.get("PLAINLIST_PTY_EOF_ON_PASSWORD") == "1"
    pwned = os.environ.get("PLAINLIST_PTY_PWNED", "")

    env = os.environ.copy()
    env.pop("PLAINLIST_INSTALL_NONINTERACTIVE", None)
    env.pop("PLAINLIST_INSTALL_PASSWORD_STDIN", None)
    env["TERM_PROGRAM"] = "test-harness"
    env.setdefault("TERM", "xterm-256color")

    if parent:
        argv = [
            "/bin/bash",
            "-c",
            'set +e; /bin/bash "$1"; code=$?; echo PARENT_RESUMED; echo PARENT_HELPER_EXIT=$code; '
            'IFS= read -r -t 1 leftover || leftover=""; '
            'if [[ -n "$leftover" ]]; then echo PARENT_GOT_LINE; eval "$leftover"; echo PARENT_EVAL_DONE; fi; '
            'exit $code',
            "helper",
            HELPER,
        ]
        if pwned:
            env["PLAINLIST_PTY_PWNED"] = pwned
    else:
        argv = ["/bin/bash", HELPER]

    pid, fd = pty.fork()
    if pid == 0:
        os.execve(argv[0], argv, env)

    buf = b""
    text = ""
    sent = 0
    start = time.time()
    timeout = 20.0
    child_status = None

    def current() -> str:
        return buf.decode("utf-8", errors="replace")

    try:
        while True:
            if time.time() - start > timeout:
                os.kill(pid, signal.SIGTERM)
                print("PTY_TIMEOUT")
                break
            ready, _, _ = select.select([fd], [], [], 0.1)
            if ready:
                try:
                    chunk = os.read(fd, 4096)
                except OSError:
                    break
                if not chunk:
                    break
                buf += chunk
                text = current()
            if eof_on_password and "Password:" in text:
                # Ctrl+D / hangup stdin to sudo -v
                try:
                    os.write(fd, b"\x04")
                except OSError:
                    pass
                eof_on_password = False
            while sent < len(sends):
                step = sends[sent]
                wait = step.get("wait") or ""
                occurrence = int(step.get("occurrence") or 1)
                if wait and text.count(wait) < occurrence:
                    break
                payload = step.get("send") or ""
                os.write(fd, payload.encode("utf-8"))
                sent += 1
        _pid, status = os.waitpid(pid, 0)
        child_status = os.WEXITSTATUS(status) if os.WIFEXITED(status) else 1
    except Exception as exc:
        print(f"PTY_ERROR {exc}")
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
        child_status = 1

    print(redact(current()))
    if pwned and os.path.exists(pwned):
        print("PWNED_EXISTS")
    return int(child_status if child_status is not None else 1)


if __name__ == "__main__":
    sys.exit(main())
