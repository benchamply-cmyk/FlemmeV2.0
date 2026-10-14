"""Resource-limited subprocess: receives bytes on stdin, never credentials or paths."""
import io
import json
import resource
import sys
import zipfile
from xml.etree import ElementTree


def parse(data, kind):
    if kind == 'pdf':
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data), strict=True)
        root = reader.trailer['/Root']
        names = root.get('/Names', {})
        if hasattr(names, 'get_object'):
            names = names.get_object()
        if (reader.is_encrypted or root.get('/OpenAction') or root.get('/AA')
                or names.get('/JavaScript') or names.get('/EmbeddedFiles') or root.get('/AcroForm')):
            raise ValueError('Active/encrypted PDF')
        if len(reader.pages) > 30:
            raise ValueError('Too many pages')
        pages = {}
        for index, page in enumerate(reader.pages, 1):
            if page.get('/AA'):
                raise ValueError('Active page')
            if any(a.get_object().get('/A') or a.get_object().get('/AA')
                   for a in page.get('/Annots', [])):
                raise ValueError('Active annotation')
            text = page.extract_text() or ''
            # Scans require OCR: reject instead of claiming a complete reading.
            if len(text.strip()) < 20:
                raise ValueError('Unreadable/scanned page')
            pages[index] = text
    elif kind == 'docx':
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            infos = archive.infolist()
            if len(infos) > 200 or sum(x.file_size for x in infos) > 4_000_000:
                raise ValueError('Archive limits')
            if any('vbaproject' in x.filename.lower() or x.flag_bits & 1 for x in infos):
                raise ValueError('Active/encrypted archive')
            xml = archive.read('word/document.xml')
            if b'<!DOCTYPE' in xml or b'<!ENTITY' in xml:
                raise ValueError('XML entities')
            tree = ElementTree.fromstring(xml)
            ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
            pages = {1: '\n'.join(''.join(p.itertext()) for p in tree.iter(ns + 'p'))}
    elif kind == 'txt':
        pages = {1: data.decode('utf-8-sig', errors='strict')}
    else:
        raise ValueError('Unsupported type')
    if not pages or sum(len(v) for v in pages.values()) > 60000 or not any(v.strip() for v in pages.values()):
        raise ValueError('Text limits')
    return pages


if __name__ == '__main__':
    try:
        resource.setrlimit(resource.RLIMIT_CPU, (8, 8))
        # Linux/Render enforces address-space limits; macOS rejects RLIMIT_AS.
        if sys.platform.startswith('linux'):
            resource.setrlimit(resource.RLIMIT_AS, (128 * 1024**2, 128 * 1024**2))
        resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
        data = sys.stdin.buffer.read(1_000_001)
        if len(data) > 1_000_000:
            raise ValueError('Byte limit')
        print(json.dumps(parse(data, sys.argv[1])))
    except Exception:
        sys.exit(2)
