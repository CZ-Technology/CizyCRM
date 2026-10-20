#!/usr/bin/env python3
"""Envia um aviso ao grupo diretamente pelo WAHA, mesmo com o CRM fora do ar."""

import base64
import json
import shlex
import subprocess
import sys
from pathlib import Path
from urllib.request import Request, urlopen


def waha_key() -> str:
    for line in Path('/home/ubuntu/cizycrm/.env').read_text().splitlines():
        if line.startswith('WAHA_API_KEY='):
            value = shlex.split(line.partition('=')[2], comments=False)
            if len(value) == 1 and value[0]:
                return value[0]
    raise RuntimeError('waha_key_missing')


def request(url: str, key: str, payload: dict | None = None):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {'X-Api-Key': key}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    with urlopen(Request(url, data=body, headers=headers), timeout=15) as response:
        return json.load(response)


def main() -> None:
    group_id, text_b64 = sys.argv[1:3]
    text = base64.b64decode(text_b64, validate=True).decode('utf-8')
    inspect = json.loads(subprocess.check_output(['docker', 'inspect', 'cizycrm-waha-1']))[0]
    ip = inspect['NetworkSettings']['Networks']['cizycrm_internal']['IPAddress']
    base = f'http://{ip}:3000'
    key = waha_key()
    sessions = request(f'{base}/api/sessions', key)
    for session in sessions:
        if session.get('status') != 'WORKING':
            continue
        name = session['name']
        groups = request(f'{base}/api/{name}/groups', key)
        values = groups if isinstance(groups, list) else groups.values()
        if not any((g.get('id') if isinstance(g.get('id'), str) else g.get('id', {}).get('_serialized')) == group_id for g in values):
            continue
        request(f'{base}/api/sendText', key, {'session': name, 'chatId': group_id, 'text': text})
        print('sent')
        return
    raise RuntimeError('group_session_not_working')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'alert_failed:{type(exc).__name__}', file=sys.stderr)
        sys.exit(1)

