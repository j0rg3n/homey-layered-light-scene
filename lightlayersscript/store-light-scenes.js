scenes = {
"Natt": "  Kjøkkenbenk Ytre:null Kjøkkenbenk Indre:null Kjøkkenbenk Midt:1900 Seng S:null Kjøkkenbord:null Veggkalender:null Taklys Stue:null Piano:null Skrivebord Stue:null Gang indre 2:1900 Leselampe J:CC Stålampe Stue:null Skatoll:null Soverom Tak:null Flomlys:null Edderkoppspot:null Hovedkontakt, rom S:null",


"Tomt hus": "Skrivebord A:null Astrid Tak:null Kjøkkenbenk Ytre:null Kjøkkenbenk Indre:null Kjøkkenbenk Midt:null Seng S:null Kjøkkenbord:null Veggkalender:null Taklys Stue:null Piano:null Skrivebord Stue:null Gang indre 2:null Leselampe J:null Stålampe Stue:null Skatoll:null Soverom Tak:null Flomlys:null Edderkoppspot:null Hovedkontakt, rom S:null",


"StuKj Levedlys": "  Kjøkkenbenk Ytre:null Kjøkkenbenk Indre:7F3F Kjøkkenbenk Midt:4C00  Kjøkkenbord:null Veggkalender:null Taklys Stue:null Piano:null Skrivebord Stue:null   Stålampe Stue:null   Flomlys:1C  ",


"StuKj Dempet": "  Kjøkkenbenk Ytre:B23F Kjøkkenbenk Indre:B23F Kjøkkenbenk Midt:B23F  Kjøkkenbord:7F00 Veggkalender:54 Taklys Stue:BF Piano:72 Skrivebord Stue:null   Stålampe Stue:14   Flomlys:60  ",


"StuKj Arbeid": "  Kjøkkenbenk Ytre:FF7F Kjøkkenbenk Indre:FF7F Kjøkkenbenk Midt:FF7F  Kjøkkenbord:FF7F Veggkalender:9B Taklys Stue:F200 Piano:FF Skrivebord Stue:FF   Stålampe Stue:FF   Flomlys:FF  ",


"S leselys": "     Seng S:6800            Edderkoppspot:19 ",


"Steinar legge": "     Seng S:null            Edderkoppspot:null ",


"S fullt": "     Seng S:FF            Edderkoppspot:FF Hovedkontakt, rom S:FF",


"SoveromAv": "            Leselampe J:CC  Skatoll:null Soverom Tak:null   ",


"SoveromDempet": "            Leselampe J:B5  Skatoll:null Soverom Tak:4C00   ",


"SoveromKontor": "            Leselampe J:FF  Skatoll:FF Soverom Tak:FFBF   ",


"Dag": "  Kjøkkenbenk Ytre:FFBF Kjøkkenbenk Indre:FF7F Kjøkkenbenk Midt:FF7F  Kjøkkenbord:FF7F Veggkalender:B2 Taklys Stue:FF7F Piano:FF Skrivebord Stue:FF Gang indre 2:FFBF  Stålampe Stue:FF Skatoll:null Soverom Tak:7F7F Flomlys:FF  ",


"Sol": "  Kjøkkenbenk Ytre:null Kjøkkenbenk Indre:CC7F Kjøkkenbenk Midt:null  Kjøkkenbord:null  Taklys Stue:null Piano:null Skrivebord Stue:null Gang indre 2:FFBF  Stålampe Stue:null Skatoll:null Soverom Tak:null   ",


"Julemorgen": "  Kjøkkenbenk Ytre:null    Kjøkkenbord:3A00  Taklys Stue:0F00 Piano:null Skrivebord Stue:51   Stålampe Stue:null   Flomlys:38  ",


"Stue natt": "        Taklys Stue:null Piano:null Skrivebord Stue:null   Stålampe Stue:null   Flomlys:null  ",


"Stue flum": "  Kjøkkenbenk Ytre:33BF Kjøkkenbenk Indre:337F Kjøkkenbenk Midt:337F    Taklys Stue:3800 Piano:35 Skrivebord Stue:null   Stålampe Stue:null   Flomlys:38  "
}

async function findVariable(name) {
    const vars = await Homey.logic.getVariables(); 
    const controlValue = _.find(vars, (o) => o.name === name);
    if (controlValue === undefined) {
        log(`Control variable ${name} missing.`)
        return undefined
    }

    if (controlValue.type !== 'string') {
        throw new Error(`Control variable ${name} (${controlValue.type}) is not a boolean.`)
    }

    return controlValue;
}


async function setVariable(name, newValue) {
    controlValue = await findVariable(name);
    if (controlValue == undefined) {
        log('Creating variable');
        controlValue = await Homey.logic.createVariable({variable: {name: name, type: 'string', value: newValue}});
        return;
    }

    log('Updating variable:', controlValue.id, controlValue.name);
    await Homey.logic.updateVariable({id: controlValue.id, variable: {value: newValue}}) 
}

for (let scene in scenes) {
    const cleanScene = 'Scene: ' + scene.replace(/ /g, '_');
    log('Scene:', cleanScene);

    sceneDescription = scenes[scene];
    sceneDescription = sceneDescription.trim().replace(/ +/g, ' ')
    log('Description:', sceneDescription);

    await setVariable(cleanScene, sceneDescription);
    log('Done.');
}