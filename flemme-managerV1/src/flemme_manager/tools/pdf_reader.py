"""PDF reading tool placeholder."""

# V4 adds an isolated parser while retaining the original extension point.
import asyncio
import json
import os
import re
import sys
from pathlib import Path
from flemme_manager.acquisition_schemas import AcquisitionError


def validate_upload(name, data):
    if not re.fullmatch(r'[\w .()-]{1,100}\.(pdf|txt|docx)', name, re.I) or '..' in name:
        raise AcquisitionError('Nom ou format de document refusé (PDF, TXT, DOCX).')
    if not data or len(data) > 1_000_000:
        raise AcquisitionError('Chaque document doit contenir entre 1 octet et 1 Mo.')
    kind = name.rsplit('.', 1)[1].lower()
    if kind == 'pdf' and not data.startswith(b'%PDF-'):
        raise AcquisitionError('Signature PDF invalide.')
    if kind == 'docx' and not data.startswith(b'PK\x03\x04'):
        raise AcquisitionError('Signature DOCX invalide.')
    return kind


async def read_document(name, data):
    kind = validate_upload(name, data)
    # No shell, original filename, local env file, or secrets reach the parser.
    environment = {'PATH': os.defpath, 'PYTHONPATH': str(Path(__file__).resolve().parents[2]),
                   'PYTHON_DOTENV_DISABLED': '1'}
    process = await asyncio.create_subprocess_exec(sys.executable, '-m',
        'flemme_manager.tools.document_worker', kind, stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, env=environment)
    try:
        output, _ = await asyncio.wait_for(process.communicate(data), timeout=12)
        if process.returncode != 0:
            raise ValueError()
        return {int(k): v for k, v in json.loads(output).items()}
    except (TimeoutError, ValueError):
        if process.returncode is None:
            process.kill()
            await process.wait()
        raise AcquisitionError('Document illisible, actif, chiffré, scanné ou dépassant les limites.') from None
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()
