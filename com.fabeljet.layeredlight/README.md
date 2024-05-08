# Layered light

Layer light scenes

# To test
Change 
```
"allowImportingTsExtensions": true
```
in tsconfig.json, and change
```
import LightLayers, { LightLayersConfig } from './lightlayers.ts';
```
in lightlayers.test.ts, then run
```
npm test
```

# To build
Undo changes in "To test", and run
```
npm run build
```