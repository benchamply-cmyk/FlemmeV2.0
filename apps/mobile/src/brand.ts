// Palette de flemme.org, relevée dans flemme-web-beta/styles.css le 28/10/2026.
// Le vert reste dans le logo ; les surfaces et actions reprennent le bleu glacier V5.
export const colors = {
  paper: '#e3eeff',
  ink: '#16131f',
  surface: '#ffffff',
  soft: '#f3f7ff',
  border: '#16131f',
  muted: '#3f3a55',
  accent: '#a5ccff',
  glacierDeep: '#4f86d9',
  violet: '#3a2fa0',
  green: '#57d68d',
};
// Fond statique : les mêmes familles de reflets que le site, sans animation.
export const brandBackground = [
  'radial-gradient(ellipse at 0% 12%, rgba(170,150,255,0.42), transparent 60%)',
  'radial-gradient(ellipse at 100% 0%, rgba(255,182,220,0.25), transparent 55%)',
  'radial-gradient(ellipse at 100% 100%, rgba(120,220,225,0.36), transparent 60%)',
  'linear-gradient(135deg, #e3eeff, #f3f7ff)',
].join(', ');
