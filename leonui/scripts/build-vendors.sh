set -e
cd /home/bitslicer/projects/leonspace/leonui
NODE_ENV=production bun build bench/src/react-app.ts --outfile bench/vendor/react-app.js --target=browser --minify
bun build bench/src/vue-app.ts --outfile bench/vendor/vue-app.js --target=browser --minify --define 'process.env.NODE_ENV="production"' --define '__VUE_OPTIONS_API__=true' --define '__VUE_PROD_DEVTOOLS__=false' --define '__VUE_PROD_HYDRATION_MISMATCH_DETAILS__=false'
bun build bench/src/alpine-app.ts --outfile bench/vendor/alpine-app.js --target=browser --minify --define 'process.env.NODE_ENV="production"'
