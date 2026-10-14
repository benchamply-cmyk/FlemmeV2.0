"""Public HTTPS only, pinned DNS address, TLS host check, no redirects or proxies."""
import http.client
import ipaddress
import socket
import ssl
import time
from html.parser import HTMLParser
from urllib.parse import urlsplit
from flemme_manager.acquisition_schemas import AcquisitionError

MAX_BYTES = 512_000


def public_url(url):
    try:
        p = urlsplit(url)
        if (p.scheme != 'https' or not p.hostname or p.username or p.password
                or p.port not in (None, 443) or len(url) > 2000
                or any(ord(c) < 33 for c in url) or '\\' in url):
            raise ValueError()
        host = p.hostname.encode('idna').decode('ascii')
        if host == 'localhost' or host.endswith(('.localhost', '.local', '.internal')):
            raise ValueError()
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and not safe_ip(address):
            raise ValueError()
        return p, host
    except (ValueError, UnicodeError):
        raise AcquisitionError('Adresse de source refusée.') from None


def safe_ip(address):
    # Reject IPv4 mapped and transition addresses, even when IPv6 classifies as global.
    return address.is_global and not (address.version == 6 and (
        address.ipv4_mapped or address.sixtofour or address.teredo))


def resolve(host):
    addresses = list(dict.fromkeys(x[4][0] for x in socket.getaddrinfo(
        host, 443, type=socket.SOCK_STREAM)))
    if not addresses or any(not safe_ip(ipaddress.ip_address(x)) for x in addresses):
        raise AcquisitionError('Adresse réseau de source refusée.')
    return addresses[0]


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, address):
        super().__init__(host, timeout=6, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        # Numeric address prevents a second DNS lookup after validation.
        raw = socket.create_connection((self.address, 443), timeout=self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except Exception:
            raw.close()
            raise


class VisibleHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ignored = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript', 'template'):
            self.ignored += 1
        if tag in ('p', 'div', 'li', 'br', 'tr', 'h1', 'h2', 'h3'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript', 'template'):
            self.ignored = max(0, self.ignored - 1)
        if tag in ('p', 'div', 'li', 'tr'):
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(data)


def fetch_page(url):
    p, host = public_url(url)
    connection = PinnedHTTPS(host, resolve(host))
    deadline = time.monotonic() + 12
    try:
        connection.request('GET', (p.path or '/') + ('?' + p.query if p.query else ''), headers={
            'Host': host, 'User-Agent': 'FlemmeEvidence/1.0', 'Accept': 'text/html,text/plain',
            'Accept-Encoding': 'identity'})
        response = connection.getresponse()
        mime = response.getheader('Content-Type', '').split(';')[0].lower()
        if response.status != 200 or mime not in ('text/html', 'text/plain'):
            raise AcquisitionError('Source inaccessible ou format non pris en charge.')
        if response.getheader('Content-Encoding', 'identity') != 'identity':
            raise AcquisitionError('Source compressée refusée.')
        length = response.getheader('Content-Length')
        if length and (not length.isdigit() or int(length) > MAX_BYTES):
            raise AcquisitionError('Source trop volumineuse.')
        chunks = bytearray()
        while len(chunks) <= MAX_BYTES:
            if time.monotonic() > deadline:
                raise AcquisitionError('Délai de lecture de source dépassé.')
            part = response.read1(min(16384, MAX_BYTES + 1 - len(chunks)))
            if not part:
                break
            chunks.extend(part)
        if len(chunks) > MAX_BYTES:
            raise AcquisitionError('Source trop volumineuse.')
        text = bytes(chunks).decode('utf-8', errors='replace')
        if mime == 'text/html':
            parser = VisibleHTML()
            parser.feed(text)
            text = ''.join(parser.parts)
        lines = [' '.join(line.split()) for line in text.splitlines() if line.strip()]
        text = '\n'.join(lines)
        if not text or len(text) > 20000:
            raise AcquisitionError('Source vide ou trop longue pour une lecture complète.')
        return text
    except AcquisitionError:
        raise
    except (OSError, http.client.HTTPException, ValueError):
        raise AcquisitionError('Lecture de source non aboutie.') from None
    finally:
        connection.close()
