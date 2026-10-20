'use strict';
/* =========================================================================
   FLEMME — page Contact
   Envoie le formulaire « contact » à Netlify Forms (même méthode que la
   candidature Brigade). Les e-mails aux administrateurs se règlent dans
   Netlify : Forms → contact → Form notifications.
   ========================================================================= */

const CT = (window.FLEMME && window.FLEMME.contact) || {};
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const FORM_URL = NATIVE ? 'https://www.flemme.org/' : '/';
const FAIL = 'L’envoi a échoué. Réessaie dans un instant'
  + (CT.email ? ', ou écris-nous à ' + CT.email : '') + '.';

const form = document.getElementById('contactForm');
const btn = document.getElementById('contactSend');
const err = document.getElementById('contactErr');

form.addEventListener('submit', async e => {
  e.preventDefault();
  const label = btn.textContent;
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Envoi…';
  try {
    const r = await fetch(FORM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)).toString()
    });
    if (!r.ok) throw new Error(r.status);
    document.getElementById('contactBox').hidden = true;
    const done = document.getElementById('contactDone');
    done.hidden = false;
    done.querySelector('h2').focus();
  } catch (x) {
    err.textContent = FAIL;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});
