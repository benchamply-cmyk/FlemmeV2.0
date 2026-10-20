"""Aperçu autonome du site (flemme-web-beta) avec le sélecteur de variantes UI/UX.

Assemble index.html, ses feuilles de style, ses scripts et le sprite d'icônes
en un seul fichier HTML, puis ajoute variantes.css et variantes.js.
Usage : python3 apercu/construire.py [fichier-de-sortie.html]
"""
import pathlib, re, sys

ici = pathlib.Path(__file__).resolve().parent
site = ici.parent / 'flemme-web-beta'
sortie = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ici / 'apercu.html')

html = (site / 'index.html').read_text(encoding='utf-8')
lire = lambda f: (site / f).read_text(encoding='utf-8')

# Feuilles de style et scripts du site, recopiés dans la page.
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: '<style>\n' + lire(m.group(1)) + '\n</style>', html)
html = re.sub(r'<script src="([^"]+)" defer></script>', lambda m: '<script>\n' + lire(m.group(1)).replace('</script', '<\\/script') + '\n</script>', html)
# Icônes : le sprite est inséré dans la page, les liens « icons.svg#… » deviennent « #… ».
sprite = lire('icons.svg').replace('<svg ', '<svg style="display:none" aria-hidden="true" ', 1)
html = html.replace('icons.svg#', '#').replace("'icons.svg#i-'", "'#i-'")
html = html.replace('<body>', '<body>\n' + sprite, 1)
# Pas de service worker ni de liens vers des fichiers absents dans l'aperçu.
html = html.replace("navigator.serviceWorker.register('./sw.js')", 'null')
# L'aperçu peut tourner dans un cadre sans adresse propre : l'historique ne doit pas bloquer la page.
garde = "<script>for(const f of ['pushState','replaceState']){const o=history[f].bind(history);history[f]=(...a)=>{try{o(...a)}catch{}}}</script>"
html = html.replace('<head>', '<head>' + garde, 1)
html = re.sub(r'<link rel="(icon|apple-touch-icon|manifest)"[^>]*>', '', html)

html = html.replace('</head>', '<style>\n' + (ici / 'variantes.css').read_text(encoding='utf-8') + '\n</style></head>', 1)
html = html.replace('</body>', '<script>\n' + (ici / 'variantes.js').read_text(encoding='utf-8') + '\n</script></body>', 1)
sortie.write_text(html, encoding='utf-8')
print('aperçu écrit :', sortie, f'({len(html) // 1024} Ko)')
