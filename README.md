# Dash docset generator for ESLint

Generates a docset from the [ESLint documentation](https://eslint.org).

**Note**: I'm not the author of the ESLint documentation. I just created a script
that automatically creates the ESLint docset based on the ESLint website.

## Building the docset

### Prerequisites

* Install `yarn` package manager: `npm install -g yarn`
* Install `dashing` from their website: [https://github.com/technosophos/dashing](https://github.com/technosophos/dashing)

### Run generator script

* `yarn run build:docset`

After the generator script has run, you find the docset at `build/docset/ESLint.docset`.


### Known issues

* Currently, only the user guide, developer guide and maintainer guide are
included in the docset. Other parts of the ESLint website/documentation will
be added at a later point.
* Some links within the original ESLint documentation are not relative links,
but absolute links to their website. These need to be changed in the original
documentation.
