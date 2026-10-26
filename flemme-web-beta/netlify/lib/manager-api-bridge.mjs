// Compatibility adapter for historical Netlify missions. No OpenAI key here.
export function managerURL() {
  const url = new URL(process.env.FLEMME_MANAGER_API_URL || 'https://flemme-manager-v2-api.onrender.com');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('Invalid Manager origin');
  return url.origin;
}

export async function qualifyWithManager(request, authorization, fetcher = fetch) {
  const response = await fetcher(managerURL() + '/api/manager/analyze', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000),
    headers: {Authorization: authorization, 'Content-Type': 'application/json'},
    body: JSON.stringify({request})
  });
  if (!response.ok) throw new Error('Manager unavailable');
  const value = await response.json();
  const states = {ready:'qualified',needs_information:'waiting_information',
    human_intervention_required:'human_required',out_of_catalog:'out_of_catalog'};
  const workflow = value.selected_workflow?.workflow_id || 'other';
  if (!Object.hasOwn(states,value.mission_status) ||
      !['comparer_devis','trouver_prestataire','rechercher_produit','organiser_voyage','other'].includes(workflow) ||
      typeof value.expected_result?.description !== 'string' ||
      typeof value.user_response?.message !== 'string' ||
      typeof value.human_intervention_required !== 'boolean' ||
      !Array.isArray(value.missing_information) || !Array.isArray(value.qualification_questions))
    throw new Error('Invalid Manager response');
  if (value.human_intervention_required !== (value.mission_status === 'human_intervention_required'))
    throw new Error('Incoherent Manager response');
  return {state:states[value.mission_status], assessment:{workflow,
    objective:value.expected_result.description,
    requested_action:value.human_intervention_required?'unknown':workflow==='comparer_devis'?'compare':'prepare',
    human_intervention_required:value.human_intervention_required,
    missing_information:value.missing_information.map(item=>item.name),
    qualification_questions:value.qualification_questions.map(item=>item.question),
    user_response:value.user_response}, agents:['Flemme Manager'],
    treatment_blockers:['Un plan actuel et sa validation sont requis avant exécution.'],
    request_text:request, model:'Flemme Manager API'};
}
