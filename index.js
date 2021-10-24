/**
 *       _           _                     _ _       _
 *   __| | __ _ ___| |__         ___  ___| (_)_ __ | |_       __ _  ___ _ __
 *  / _` |/ _` / __| '_ \ _____ / _ \/ __| | | '_ \| __|____ / _` |/ _ \ '_ \
 * | (_| | (_| \__ \ | | |_____|  __/\__ \ | | | | | ||_____| (_| |  __/ | | |
 *  \__,_|\__,_|___/_| |_|      \___||___/_|_|_| |_|\__|     \__, |\___|_| |_|
 *                                                           |___/
 * Dash (https://kapeli.com) docset generator for ESLint (https://eslint.org).
 */

// -----------------------------------------------------------------------------
// IMPORTS
// -----------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');
const shelljs = require('shelljs');
const task = require('tasuku');


// -----------------------------------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------------------------------

const ERROR_ESLINT_INSTALL_DEPENDENCIES = 'Could not install ESLint dependencies';
const ERROR_ESLINT_RUN_BUILD_SITE = 'Could not build ESLint documentation';
const ERROR_ESLINT_RUN_GENSITE = 'Could not run ESLint "gensite" script';
const ERROR_DOCSET_APPLY_TRANSFORMATIONS = 'Could not apply transformations to ESLint documentation';
const ERROR_DOCSET_BUILD = 'Could not build docset';
const ERROR_GIT_CLONE = 'Could not clone/init ESLint Git repositories';
const ERROR_GIT_APPLY_PATCHES = 'Could not apply Git patches to ESLint documentation';

const GIT_REPO_ESLINT = 'https://github.com/eslint/eslint.git';
const GIT_REPO_ESLINT_WEBSITE = 'https://github.com/eslint/website.git';

const PATH_ASSETS = 'assets/';
const PATH_BUILD = 'build/';
const PATH_BUILD_DOCSET = 'build/docset/';
const PATH_BUILD_ESLINT = 'build/eslint/'
const PATH_BUILD_ESLINT_WEBSITE = 'build/website/';
const PATH_BUILD_SITE = 'build/website/_site/';
const PATH_GIT_PATCHES = 'patches/';

const TASK_ESLINT_INSTALL_DEPENDENCIES = 'Installing ESLint dependencies';
const TASK_ESLINT_RUN_BUILD_SITE = 'Running script to build ESLint documentation';
const TASK_ESLINT_RUN_GENSITE = 'Running ESLint "gensite" script';
const TASK_DOCSET_APPLY_TRANSFORMATIONS = 'Applying transformations to ESLint documentation'
const TASK_DOCSET_BUILD = 'Building docset';
const TASK_GIT_CLONE = 'Cloning/Initializing ESLint repositories';
const TASK_GIT_APPLY_PATCHES = 'Applying Git patches to ESLint documentation';


// -----------------------------------------------------------------------------
// HELPER
// -----------------------------------------------------------------------------

// Based on https://stackoverflow.com/a/55566081
const readDirRecursiveSync = (root, files = []) => {
  if (fs.statSync(root).isDirectory()) {
    fs.readdirSync(root).map(file => {
      readDirRecursiveSync(files[files.push(path.join(root, file)) - 1], files);
    });
  }

  return files;
};


// -----------------------------------------------------------------------------
// CONTENT TRANSFORMATIONS
// -----------------------------------------------------------------------------

/**
 * In Dash, we don't have a server that properly rewrites URLs. Therefore, we
 * need to adjust internal links so that they point to the right HTML file
 *
 * @examples
 * * folder/ -> folder/index.html
 * * page -> page.html
 * * page#anchor -> page.html#anchor
 * * #anchor -> #anchor
 *
 * @param {string} href The link to transform
 * @return {string} The transformed link
 */
const transformLink = href => {
  const parts = path.parse(href);
  let anchor = null;
  let isDir = false;

  // If we are dealing with a link to an anchor on the same page, we
  // don't need to do anything
  if (href.startsWith('#')) {
    return href;
  }

  // If there is an anchor reference in the link, we store the anchor name for
  // later use. It will be applied again at the final transformation of the link
  if (href.indexOf('#') > -1) {
    const innerParts = href.split('#');
    href = innerParts[0];
    anchor = innerParts[1];
  }

  // Let's create a relative path for the link based on the current directory
  if (parts.root !== '') {
    const relativePath = path.relative(parts.root, path.dirname(href));
    href = `${relativePath}/${parts.base}`;
  }

  // Let's find out if the reference is pointing to a directory
  try {
    const absolutePath = path.resolve(__dirname, href);
    isDir = fs.statSync(absolutePath).isDirectory();
  } catch (e) { }

  // If we are dealing with a reference to a directory, we point to the
  // index.html file in that directory
  if (isDir || href.endsWith('/')) {
    href = path.join(href, '/', 'index.html');
  }

  // For all internal links that do not already have the extension .html, we
  // apply the .html extension
  if (!href.startsWith('http') &&
    (
      !path.extname(href) ||
      path.extname(href) !== '.html' ||
      // Paths like migrating-to-8.0.0 will cause extname to be .0
      path.extname(href) === '.0'
    )
  ) {
    href += '.html';
  }

  // Finally, we re-apply the reference to an anchor, if one was provided
  if (anchor !== null) {
    href += `#${anchor}`;
  }

  return href;
};


/**
 * Adjust all internal links within all files provided
 *
 * @see transformLink
 * @param {array} files List of files to adjust links for
 */
const adjustInternalLinks = files => {
  files.forEach(file => {
    const tmpFile = `${file}.tmp`;
    const fileContent = fs.readFileSync(file, 'utf-8');
    const dom = parse(fileContent);

    const linkNodes = dom.querySelectorAll('a');
    linkNodes.forEach(linkNode => {
      let href = linkNode.getAttribute('href');
      if (href) {
        const transformedHref = transformLink(href);
        linkNode.setAttribute('href', transformedHref);
      }
    });

    fs.writeFileSync(tmpFile, dom.toString(), 'utf-8');
    fs.renameSync(tmpFile, file);
  });
};


/**
 * Creates named links around headline tags found on a page so that Dash can
 * automatically create a ToC for that page.
 * See: https://kapeli.com/docsets#tableofcontents
 *
 * @param {array} files List of file to create a ToC for
 */
const addTOC = files => {
  files.forEach(file => {
    const tmpFile = `${file}.tmp`;
    const fileContent = fs.readFileSync(file, 'utf-8');
    const dom = parse(fileContent);

    const headlineNodes = dom.querySelectorAll('h2, h3, h4, h5, h6');
    headlineNodes.forEach(headlineNode => {
      const headlineNodeText = headlineNode.innerText;
      headlineNode.replaceWith(`
        <a name="//apple_ref/cpp/Section/${headlineNodeText}" class="dashAnchor">
          ${headlineNode.toString()}
        </a>`);
    });

    fs.writeFileSync(tmpFile, dom.toString(), 'utf-8');
    fs.renameSync(tmpFile, file);
  });
};


// -----------------------------------------------------------------------------
// TASKS
// -----------------------------------------------------------------------------

const gitCloneRepo = (url, destination) => new Promise((resolve, reject) => {
  shelljs.exec(`git clone ${url} ${destination}`, {
    async: true,
    encoding: 'utf-8',
    silent: true
  }, (code, stdout, stderr) => {
    if (code === 0) {
      resolve(true);
      return;
    }

    reject(new Error(`${ERROR_GIT_CLONE} ${JSON.stringify({ url, destination, stderr })}`));
  });
});


const eslintInstallDependencies = () => new Promise((resolve, reject) => {
  shelljs.exec(`cd ${PATH_BUILD_ESLINT} && npm install --legacy-peer-deps`, {
    async: true,
    encoding: 'utf-8',
    silent: true
  }, (code, stdout, stderr) => {
    if (code === 0) {
      shelljs.exec(`cd ${PATH_BUILD_ESLINT_WEBSITE} && npm install`, {
        async: true,
        encoding: 'utf-8',
        silent: true
      }, (code, stdout, stderr) => {
        if (code === 0) {
          resolve(true);
          return;
        }

        reject(new Error(`${ERROR_ESLINT_INSTALL_DEPENDENCIES} for website ${JSON.stringify({ code, stdout, stderr })}`));
      });
    } else {
      reject(new Error(`${ERROR_ESLINT_INSTALL_DEPENDENCIES} for eslint ${JSON.stringify({ code, stdout, stderr })}`));
    }
  });
});


const eslintRunGensiteScript = () => new Promise((resolve, reject) => {
  shelljs.exec(`cd ${PATH_BUILD_ESLINT} && npm run gensite`, {
    async: true,
    encoding: 'utf-8',
    silent: true
  }, (code, stdout, stderr) => {
    if (code === 0) {
      resolve(true);
      return;
    }

    reject(new Error(`${ERROR_ESLINT_RUN_GENSITE}, ${JSON.stringify({ code, stdout, stderr })}}`))
  });
});


const gitApplyPatches = () => new Promise((resolve, reject) => {
  shelljs.exec(`cd ${PATH_BUILD_ESLINT_WEBSITE} && git apply ../../${PATH_GIT_PATCHES}*.patch`, {
    async: true,
    encoding: 'utf-8',
    silent: true
  }, (code, stdout, stderr) => {
    if (code === 0) {
      resolve(true);
      return;
    }

    reject(new Error(`${ERROR_GIT_APPLY_PATCHES}, ${JSON.stringify({ code, stdout, stderr })}}`))
  });
});


const eslintRunBuildScript = () => new Promise((resolve, reject) => {
  shelljs.exec(`cd ${PATH_BUILD_ESLINT_WEBSITE} && npm run build`, {
    async: true,
    encoding: 'utf-8',
    silent: true
  }, (code, stdout, stderr) => {
    if (code === 0) {
      resolve(true);
      return;
    }

    reject(new Error(`${ERROR_ESLINT_RUN_BUILD_SITE}, ${JSON.stringify({ code, stdout, stderr })}}`))
  });
});


const docsetApplyTransformations = () => new Promise((resolve, reject) => {
  const htmlFiles = readDirRecursiveSync(`./${PATH_BUILD_SITE}`).filter(
    file => path.extname(file) === '.html'
  );
  try {
    adjustInternalLinks(htmlFiles);
    addTOC(htmlFiles);
  } catch (e) {
    reject(new Error(`${ERROR_DOCSET_APPLY_TRANSFORMATIONS}, ${JSON.stringify({ code, stdout, stderr })}}`))
  }


  resolve(true);
});


const docsetBuild = () => new Promise((resolve, reject) => {
  shelljs.exec(`cp ${PATH_ASSETS}dashing.json ${PATH_BUILD_SITE} &&
    cd ${PATH_BUILD_SITE} &&
    dashing build eslint &&
    mkdir ../../../${PATH_BUILD_DOCSET} &&
    mv ESLint.docset/ ../../../${PATH_BUILD_DOCSET}/ESLint.docset &&
    cd ../../.. &&
    cp ${PATH_ASSETS}icon* ${PATH_BUILD_DOCSET}/ &&
    cp ${PATH_ASSETS}README.md ${PATH_BUILD_DOCSET}/ &&
    cp ${PATH_ASSETS}docset.json ${PATH_BUILD_DOCSET}/
  `, {
    async: true,
    encoding: 'utf-8',
    silent: true
  }, (code, stdout, stderr) => {
    if (code === 0) {
      resolve(true);
      return;
    }

    reject(new Error(`${ERROR_DOCSET_BUILD}, ${JSON.stringify({ code, stdout, stderr })}}`))
  });
});


// -----------------------------------------------------------------------------
// TASK RUNNER
// -----------------------------------------------------------------------------

(async () => {
  await task.group(task => [
    task(TASK_GIT_CLONE, async ({ setError }) => {
      try {
        await gitCloneRepo(GIT_REPO_ESLINT, `${PATH_BUILD_ESLINT}`);
        await gitCloneRepo(GIT_REPO_ESLINT_WEBSITE, `${PATH_BUILD_ESLINT_WEBSITE}`);
      } catch(e) {
        setError(e);
      }
    }),
    task(TASK_ESLINT_INSTALL_DEPENDENCIES, async ({ setError }) => {
      try {
        await eslintInstallDependencies();
      } catch (e) {
        setError(e);
      }
    }),
    task(TASK_ESLINT_RUN_GENSITE, async ({ setError }) => {
      try {
        await eslintRunGensiteScript();
      } catch (e) {
        setError(e);
      }
    }),
    task(TASK_GIT_APPLY_PATCHES, async ({ setError }) => {
      try {
        await gitApplyPatches();
      } catch (e) {
        setError(e);
      }
    }),
    task(TASK_ESLINT_RUN_BUILD_SITE, async ({ setError }) => {
      try {
        await eslintRunBuildScript();
      } catch (e) {
        setError(e);
      }
    }),
    task(TASK_DOCSET_APPLY_TRANSFORMATIONS, async ({ setError }) => {
      try {
        await docsetApplyTransformations();
      } catch (e) {
        setError(e);
      }
    }),
    task(TASK_DOCSET_BUILD, async ({ setError }) => {
      try {
        await docsetBuild();
      } catch (e) {
        setError(e);
      }
    })
  ], { concurrency: 1 });
})();
