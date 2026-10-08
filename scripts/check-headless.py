"""Exercise the packaged Linux launcher with and without --headless using a TTY."""
import fcntl
import os
import re
import select
import struct
import subprocess
import termios
import time
import tempfile
import hashlib
import shlex


def check(arguments):
    master, slave = os.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 160, 0, 0))
    env = dict(os.environ)
    for name in ('DISPLAY', 'WAYLAND_DISPLAY', 'ELECTRON_RUN_AS_NODE'):
        env.pop(name, None)
    env.update(TERM='xterm-256color', SHELL='/bin/bash')
    child = subprocess.Popen(
        [os.environ.get('PORTAL_CONSOLE_EXECUTABLE', 'release/linux-unpacked/portal-console'), '--mode', 'modern', *arguments],
        stdin=slave, stdout=slave, stderr=slave, env=env,
    )
    os.close(slave)
    output = b''
    directory = tempfile.TemporaryDirectory(prefix='portal-cwd-')
    try:
        def wait_for(pattern):
            nonlocal output
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                match = re.search(pattern, output)
                if match:
                    return match
                if select.select([master], [], [], 0.2)[0]:
                    try:
                        output += os.read(master, 65536)
                    except OSError:
                        break
            raise AssertionError(output[-16000:].decode(errors='replace') or 'No headless output')

        def prefix(key):
            os.write(master, b'\x02' + key)  # Deliberately coalesced in one write.

        def shell_pid(label):
            os.write(master, f"printf 'PID_{label}=%s\\n' $$\r".encode())
            return int(wait_for(f'PID_{label}=(\\d+)'.encode()).group(1))

        def shell_cwd(label):
            os.write(master, f"printf 'DIR_{label}=%s\\n' \"$(pwd -P | sha256sum | cut -d' ' -f1)\"\r".encode())
            return wait_for(f'DIR_{label}=([0-9a-f]{{64}})'.encode()).group(1).decode()

        wait_for(b'PRIMARY TERMINAL')
        main_pid = shell_pid('main_before')
        prefix(b'n')
        auxiliary_pid = shell_pid('aux_before')
        assert main_pid != auxiliary_pid
        prefix(b'p')
        assert shell_pid('main_returned') == main_pid
        prefix(b'P')  # Previous from first wraps to the last terminal.
        assert shell_pid('last') not in (main_pid, auxiliary_pid)
        prefix(b'N')
        assert shell_pid('main_wrapped') == main_pid
        os.write(master, f'cd -- {shlex.quote(directory.name)}\r'.encode())
        expected = hashlib.sha256((os.path.realpath(directory.name) + '\n').encode()).hexdigest()
        assert shell_cwd('before') == expected
        prefix(b'r')
        wait_for(b'PRIMARY TERMINAL RESTARTED')
        os.write(master, b'\x1b')
        assert shell_pid('main_after') != main_pid
        assert shell_cwd('kept') == expected
        output = b''
        prefix(b'R')
        wait_for(b'RESET CWD')
        os.write(master, b'\x1b')
        reset = hashlib.sha256((os.path.realpath(os.path.expanduser('~')) + '\n').encode()).hexdigest()
        assert shell_cwd('reset') == reset
        prefix(b'n')
        assert shell_pid('aux_after') == auxiliary_pid
        prefix(b'?')
        wait_for(b'PORTAL CONSOLE HELP')
        wait_for(b'portal-restart')
        os.write(master, b'G')
        wait_for(b'EXIT AND HELP NAVIGATION')
        os.write(master, b'q')
        assert shell_pid('aux_after_help') == auxiliary_pid
        os.write(master, b'portal-help\r')
        # Clear old output to verify that a new help screen is rendered.
        output = b''
        wait_for(b'PORTAL CONSOLE HELP')
        os.write(master, b'q')
        assert shell_pid('aux_after_command_help') == auxiliary_pid
        prefix(b'q')
        child.wait(timeout=10)
        assert child.returncode == 0, output[-16000:].decode(errors='replace')
        print(f'Headless next/previous, wrap, isolated restart, paged help and exit verified: {arguments or "automatic fallback"}')
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
        os.close(master)
        directory.cleanup()


check(['--headless'])
check([])
