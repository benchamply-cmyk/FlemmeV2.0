/* Aperçu seulement : remplace gestionadmin.js (le centre de contrôle a besoin de Supabase).
   Affiche le tableau de bord et fait fonctionner les onglets ; seul « Flemme Manager » a des données fictives. */
(() => {
  const $ = id => document.getElementById(id);
  const go = () => {
    $('board').hidden = false; $('who').textContent = 'ben@exemple.fr';
    const views = document.querySelectorAll('[data-view]');
    const open = view => {
      views.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
      $('requests').hidden = view !== 'demandes'; $('managerView').hidden = view !== 'manager';
      $('adminPanel').hidden = ['demandes', 'manager'].includes(view);
      $('adminPanel').textContent = 'Aperçu : cet onglet a besoin des vraies données Supabase.';
      $('loading').textContent = 'Aperçu : les demandes ont besoin des vraies données Supabase.';
    };
    views.forEach(b => b.addEventListener('click', () => open(b.dataset.view)));
    open('manager');
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', go); else go();
})();
