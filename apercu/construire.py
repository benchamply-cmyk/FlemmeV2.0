"""Aperçu autonome du site (flemme-web-beta) pour travailler le design V5.

Assemble chaque page publique avec ses feuilles de style, ses scripts et le sprite
d'icônes en un fichier HTML autonome. index.html est la page principale de
l'artefact ; les autres pages sont publiées à côté (mêmes noms de fichiers),
donc les liens entre pages fonctionnent dans l'aperçu.
Usage : python3 apercu/construire.py [dossier-de-sortie]
"""
import pathlib, re, sys

ici = pathlib.Path(__file__).resolve().parent
site = ici.parent / 'flemme-web-beta'
sortie = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ici / 'sortie')
sortie.mkdir(parents=True, exist_ok=True)
PAGES = ['index.html', 'services.html', 'demarche.html', 'ambassadeurs.html', 'rejoindre.html', 'mentions.html', 'confidentialite.html']

lire = lambda f: (site / f).read_text(encoding='utf-8')
sprite = lire('icons.svg').replace('<svg ', '<svg style="display:none" aria-hidden="true" ', 1)
# L'aperçu peut tourner dans un cadre sans adresse propre : l'historique ne doit pas bloquer la page.
garde = "<script>for(const f of ['pushState','replaceState']){const o=history[f].bind(history);history[f]=(...a)=>{try{o(...a)}catch{}}}</script>"

for page in PAGES:
    html = lire(page)
    # Feuilles de style et scripts du site, recopiés dans la page.
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: '<style>\n' + lire(m.group(1)) + '\n</style>', html)
    html = re.sub(r'<script src="([^"]+)" defer></script>', lambda m: '<script>\n' + lire(m.group(1)).replace('</script', '<\\/script') + '\n</script>', html)
    # Icônes : le sprite est inséré dans la page, les liens « icons.svg#… » deviennent « #… ».
    html = html.replace('icons.svg#', '#').replace("'icons.svg#i-'", "'#i-'")
    html = html.replace('<body>', '<body>\n' + sprite, 1)
    # Pas de service worker ni de liens vers des fichiers absents dans l'aperçu.
    html = html.replace("navigator.serviceWorker.register('./sw.js')", 'null')
    html = html.replace('<head>', '<head>' + garde, 1)
    html = re.sub(r'<link rel="(icon|apple-touch-icon|manifest)"[^>]*>', '', html)
    if page == 'index.html':
        html = re.sub(r'<title>[^<]*</title>', '<title>Flemme design V5</title>', html, count=1)
    (sortie / page).write_text(html, encoding='utf-8')
    print('aperçu écrit :', sortie / page, f'({len(html) // 1024} Ko)')
