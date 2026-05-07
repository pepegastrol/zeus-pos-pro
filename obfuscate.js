const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, 'js');

// Leer todos los archivos JS
fs.readdirSync(jsDir).forEach(file => {
    if (file.endsWith('.js')) {
        const filePath = path.join(jsDir, file);
        const code = fs.readFileSync(filePath, 'utf8');
        
        console.log(`Ofuscando: ${file}...`);
        
        const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
            compact: true,
            controlFlowFlattening: true,
            controlFlowFlatteningThreshold: 0.75,
            numbersToExpressions: true,
            simplify: true,
            stringArrayShuffle: true,
            splitStrings: true,
            stringArrayThreshold: 0.75
        });
        
        fs.writeFileSync(filePath, obfuscationResult.getObfuscatedCode());
    }
});

console.log("¡Ofuscación completada con éxito!");
