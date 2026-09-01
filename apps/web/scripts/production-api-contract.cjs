const CANONICAL_API_ORIGIN = 'https://plainlist.space';

function productionApiOrigin(configuredOrigin) {
  const origin = configuredOrigin || CANONICAL_API_ORIGIN;
  if (origin !== CANONICAL_API_ORIGIN) {
    throw new Error(`production releases must use ${CANONICAL_API_ORIGIN}`);
  }
  return origin;
}

module.exports = { CANONICAL_API_ORIGIN, productionApiOrigin };

if (require.main === module) {
  try {
    process.stdout.write(productionApiOrigin(process.argv[2] || ''));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
