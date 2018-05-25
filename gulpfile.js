const exec = require('child_process').exec;
const fs = require('fs');
const readline = require('readline');

const cwsupload = require('chrome-webstore-upload');
const eslint = require('gulp-eslint');
const {google} = require('googleapis');
const gulp = require('gulp');
const jeditor = require('gulp-json-editor');
const zip = require('gulp-zip');

const CWS_ID = 'aojcceglbipehndciapjedoomockgagl';

/**
 * Checks the code for style errors.
 */
gulp.task('lint', () => {
  return gulp.src(['src/**/*.js', 'gulpfile.js', '!node_modules/**'])
      .pipe(eslint({
        baseConfig: require('./.eslintrc.js')
      }))
      .pipe(eslint.format())
      .pipe(eslint.failAfterError());
});

/**
 * Updates the Chrome Web Store manifest to point to the latest version of the
 * scriipt.
 */
gulp.task('latest', () => {
  // Determine the latest version of the script.
  exec('clasp versions', (err, out) => {
    if (err) return console.error(err);
    const line = out.trim().split('\n').pop();
    const version = line.split(' ').shift();

    // Update the manifest.
    gulp.src('webstore/manifest.json')
      .pipe(jeditor((json) => {
        json.container_info.container_version = version;
        return json;
      }))
      .pipe(gulp.dest('webstore'));
  });
});

/**
 * Bumps the version of the Chrome Web Store manifest.
 */
gulp.task('bump', (cb) => {
  gulp.src('webstore/manifest.json')
    .pipe(jeditor((json) => {
      json.version = String(Number(json.version) + 1);
      return json;
    }))
    .pipe(gulp.dest('webstore'))
    .on('end', cb);
});

/**
 * Builds a new CRX zip file.
 */
gulp.task('compress', ['bump'], (cb) => {
  gulp.src('webstore/*')
    .pipe(zip('crx.zip'))
    .pipe(gulp.dest('build')
    .on('end', cb));
});

/**
 * Uploads the CRX zip file to the Chrome Web Store
 */
gulp.task('upload', ['compress'], (cb) => {
  var webStore = getWebStore();
  const crx = fs.createReadStream('./build/crx.zip');
  webStore.uploadExisting(crx).then((res) => {
    console.log('Draft uploaded to Chrome Web Store.');
    cb();
  }).catch((e) => {
    console.error(e);
  });
});

/**
 * Publishes the draft Chrome Web Store listing.
 */
gulp.task('publish', ['upload'], () => {
  var webStore = getWebStore();
  webStore.publish().then((res) => {
    console.log('Chrome Web Store draft published.');
  });
});

/**
 * Authorizes access to the Chrome Web Store API. Only needs to be run once
 * when first setting up the project.
 */
gulp.task('authorize', () => {
  const credentials = require('./credentials/client_secret.json');
  const oAuth2Client = new google.auth.OAuth2(
      credentials.installed.client_id,
      credentials.installed.client_secret,
      credentials.installed.redirect_uris[0]);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/chromewebstore'],
  });
  console.log('Authorize access to the CWS API by visiting this url:',
      authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) return console.log(err);
        fs.writeFile('./credentials/token.json', JSON.stringify(token),
            (err) => {
              if (err) return console.error(err);
            });
      });
  });
});

/**
 * Gets an instance of the Chrome Web Store listing using the stored credentials
 * and tokens.
 * @return {object} The Chrome Web Store listing object.
 */
function getWebStore() {
  const credentials = require('./credentials/client_secret.json');
  const tokens = require('./credentials/token.json');
  return cwsupload({
    extensionId: CWS_ID,
    clientId: credentials.installed.client_id,
    clientSecret: credentials.installed.client_secret,
    refreshToken: tokens.refresh_token
  });
}
