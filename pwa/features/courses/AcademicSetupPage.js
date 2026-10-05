// Configuration académique — facultative, modifiable plus tard dans Profil.
function renderAcademicSetup(){
  const p=state.profile;
  app.innerHTML=`<section class="onboarding">
    <div>
      ${PageIntro({eyebrow:'CONFIGURATION',title:'Profil académique',subtitle:'Facultatif — vous pourrez tout changer plus tard.'})}
      <div class="form-card">
        ${Field({label:'Université',id:'acUni',value:p.university,placeholder:'Ex. Sorbonne Université'})}
        ${Field({label:'Faculté',id:'acFaculty',value:p.faculty,placeholder:'Ex. Sciences & Ingénierie'})}
        ${Field({label:'Filière / majeure',id:'acProgram',value:p.program,placeholder:'Ex. EEA'})}
        <div class="field-row">${Field({label:'Niveau',id:'acLevel',value:p.level,placeholder:'L2'})}${Field({label:'Semestre',id:'acSem',value:p.semester,placeholder:'S3'})}</div>
        ${Field({label:'Année universitaire',id:'acYear',value:p.academicYear,placeholder:'2026–2027'})}
      </div>
    </div>
    <div class="button-stack">
      ${ActionButton({label:'Continuer',id:'saveAcademic',iconName:'arrowRight'})}
      ${ActionButton({label:'Passer pour le moment',id:'skipAcademic',variant:'ghost'})}
    </div>
  </section>`;
  byId('saveAcademic').onclick=async()=>{Object.assign(state.profile,{university:byId('acUni').value.trim(),faculty:byId('acFaculty').value.trim(),program:byId('acProgram').value.trim(),level:byId('acLevel').value.trim(),semester:byId('acSem').value.trim(),academicYear:byId('acYear').value.trim()||'2026–2027'});state.onboardingComplete=true;state.academicSetupSeen=true;saveState();try{await syncProfile()}catch{}navigate('home')};
  byId('skipAcademic').onclick=()=>{state.onboardingComplete=true;state.academicSetupSeen=true;saveState();navigate('home')};
}
