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
# styles.css : le bloc du design publié (E + Gamme Glacier) va dans <style id="vx-site">,
# que variantes.js coupe pour les variantes B à E (elles partent de la base V4.100).
def feuille(f):
    css = lire(f)
    i = css.find('/* =========================================================================\n   Design « E + Gamme Glacier »')
    if f != 'styles.css' or i < 0:
        return '<style>\n' + css + '\n</style>'
    j = css.find('/* =========================================================================\n   Options UX', i)
    j = j if j > 0 else len(css)
    # Le bloc « Bleu métal » (PR31) a sa propre feuille, que le panneau peut couper.
    k = css.find('/* =========================================================================\n   Fond « Bleu métal »', j)
    k = k if k > 0 else len(css)
    return ('<style>\n' + css[:i] + '\n:root { --surface: #fff; --surface-hover: #f1effa; --g400: var(--violet); --glow: none; }\n</style>'
            + '<style id="vx-site">\n' + css[i:j] + '\n</style><style>\n' + css[j:k] + '\n</style>'
            + '<style id="vx-metal">\n' + css[k:] + '\n</style>')
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: feuille(m.group(1)), html)
# Les illustrations du site sont remplacées par celles de l'aperçu (avec leur panneau).
html = html.replace('<script src="illustrations.js" defer></script>', '')
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

for css in ('variantes.css', 'illustrations.css'):
    html = html.replace('</head>', '<style>\n' + (ici / css).read_text(encoding='utf-8') + '\n</style></head>', 1)
for js in ('variantes.js', 'illustrations.js'):
    html = html.replace('</body>', '<script>\n' + (ici / js).read_text(encoding='utf-8') + '\n</script></body>', 1)
# Titre distinct de l'aperçu de la PR28, qui porte le titre du site.
html = re.sub(r'<title>[^<]*</title>', '<title>Flemme variantes UI</title>', html, count=1)
sortie.write_text(html, encoding='utf-8')
print('aperçu écrit :', sortie, f'({len(html) // 1024} Ko)')
