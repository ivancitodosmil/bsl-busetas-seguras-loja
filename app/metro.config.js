// Configuración de Metro. Lo único propio: en la vista previa web, react-native-maps se
// cambia por un recuadro (scripts/web/react-native-maps.js). En Android e iOS no cambia nada.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const resolverBase = config.resolver.resolveRequest;
config.resolver.resolveRequest = (contexto, modulo, plataforma) => {
  if (plataforma === 'web' && modulo === 'react-native-maps') {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'scripts/web/react-native-maps.js') };
  }
  return (resolverBase ?? contexto.resolveRequest)(contexto, modulo, plataforma);
};

module.exports = config;
