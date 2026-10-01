"""Exercise the packaged Linux launcher with and without --headless using a TTY."""
import fcntl
import os
import select
import struct
import subprocess
import termios
import time


def check(arguments):
    master, slave = os.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 160, 0, 0))
    env = dict(os.environ)
    for name in ('DISPLAY', 'WAYLAND_DISPLAY', 'ELECTRON_RUN_AS_NODE'):
        env.pop(name, None)
    env.update(TERM='xterm-256color', SHELL='/bin/bash')
    child = subprocess.Popen(
        ['release/linux-unpacked/portal-console', '--mode', 'modern', *arguments],
        stdin=slave, stdout=slave, stderr=slave, env=env,
    )
    os.close(slave)
    output = b''
    sent = False
    try:
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if select.select([master], [], [], 0.2)[0]:
                try:
                    output += os.read(master, 65536)
                except OSError:
                    break
            if not sent and b'PRIMARY TERMINAL' in output:
                os.write(master, b"printf 'portal-%s\\n' headless-smoke-ok\r")
                sent = True
            if b'portal-headless-smoke-ok' in output:
                os.write(master, b'\x02')
                time.sleep(0.1)
                os.write(master, b'q')
                child.wait(timeout=10)
                assert child.returncode == 0, output.decode(errors='replace')
                print(f'Packaged headless launch and shell verified: {arguments or "automatic fallback"}')
                return
        raise AssertionError(output.decode(errors='replace') or 'No headless output')
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
        os.close(master)


check(['--headless'])
check([])
