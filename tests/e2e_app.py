"""Local integration fixture. Only the language model and Netlify Forms are simulated."""
from pathlib import Path
from fastapi import Request, Response
from fastapi.staticfiles import StaticFiles
from flemme_manager.main import app
from flemme_manager.settings import settings
from flemme_manager.agents import qualification
from flemme_manager.qualification_models import QualificationAssessment

ROOT = Path(__file__).resolve().parents[1]
settings.service_key = 'e2e-service'
settings.operator_key = 'e2e-operator'
settings.executor_key = 'e2e-executor'
forms = []

async def model(history, previous):
    user_text = '\n'.join(x['content'] for x in history if x['role'] == 'user')
    ready = 'Lyon' in user_text and '200' in user_text
    return QualificationAssessment(
        service_category='service_provider',expected_result={'description':'Une terrasse nettoyée samedi à Lyon.'},
        selected_workflow={'workflow_id':'trouver_prestataire','reason':'Nettoyage local'},
        missing_information=[] if ready else [{'name':'location','reason':'Zone à préciser'}],
        qualification_questions=[] if ready else [{'question':'Dans quelle ville ?','why_needed':'Recherche locale','priority':1}],
        mission_status='ready' if ready else 'needs_information',human_intervention_required=False,
        user_response={'message':'Voici le récapitulatif.' if ready else 'Précisons le lieu et le budget.'},
        facts={'scope':'Nettoyer la terrasse','location':'Lyon' if ready else None,'budget':'200 EUR' if ready else None,'deadline':'Samedi' if ready else None})
qualification.analyze_conversation = model

@app.middleware('http')
async def local_proxy(request, call_next):
    if request.url.path.startswith('/api/qualification/'):
        request.scope['headers'].append((b'x-flemme-service-key', b'e2e-service'))
    return await call_next(request)

@app.get('/content.js')
def content():
    return Response((ROOT/'flemme-web-beta/content.js').read_text()+'\nwindow.FLEMME.qualification={enabled:true};',media_type='application/javascript')

@app.post('/')
async def form(request: Request):
    data = dict(await request.form())
    forms.append({k:v for k,v in data.items() if isinstance(v,str)})
    return Response('retry' if len(forms) == 1 else 'ok',status_code=502 if len(forms) == 1 else 200)

@app.get('/__test/forms')
def received_forms():
    return forms

app.mount('/',StaticFiles(directory=ROOT/'flemme-web-beta',html=True),name='site')
