import { commission, money, parseMoney } from '../../mobile/src/domain.ts';
import './styles.css';
import './landing.css';

// Calculateur de la vitrine : même arrondi au centime que l’accord enregistré par l’app.
const input = document.getElementById('amount') as HTMLInputElement;
const out = (id: string, value: string) => { document.getElementById(id)!.textContent = value; };
function update() {
  try {
    const amount = parseMoney(input.value) as number;
    out('cBase', money(amount)); out('cFee', money(commission(amount))); out('cTotal', money(amount + commission(amount))); out('calcError', '');
    input.removeAttribute('aria-invalid');
  } catch (e) { out('calcError', (e as Error).message); input.setAttribute('aria-invalid', 'true'); }
}
input.addEventListener('input', update);
document.getElementById('calc')!.addEventListener('submit', e => e.preventDefault());
update();
