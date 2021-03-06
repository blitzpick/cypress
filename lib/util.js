'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var _ = require('lodash');
var R = require('ramda');
var os = require('os');
var tty = require('tty');
var path = require('path');
var _isCi = require('is-ci');
var execa = require('execa');
var getos = require('getos');
var chalk = require('chalk');
var Promise = require('bluebird');
var cachedir = require('cachedir');
var executable = require('executable');
var _supportsColor = require('supports-color');
var _isInstalledGlobally = require('is-installed-globally');
var pkg = require(path.join(__dirname, '..', 'package.json'));
var logger = require('./logger');
var debug = require('debug')('cypress:cli');

var getosAsync = Promise.promisify(getos);

var stringify = function stringify(val) {
  return _.isObject(val) ? JSON.stringify(val) : val;
};

function normalizeModuleOptions() {
  var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

  return _.mapValues(options, stringify);
}

function stdoutLineMatches(expectedLine, stdout) {
  var lines = stdout.split('\n').map(R.trim);
  var lineMatches = R.equals(expectedLine);
  return lines.some(lineMatches);
}

/**
 * Prints NODE_OPTIONS using debug() module, but only
 * if DEBUG=cypress... is set
 */
function printNodeOptions() {
  var log = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : debug;

  if (!log.enabled) {
    return;
  }

  if (process.env.NODE_OPTIONS) {
    log('NODE_OPTIONS=%s', process.env.NODE_OPTIONS);
  } else {
    log('NODE_OPTIONS is not set');
  }
}

var util = {
  normalizeModuleOptions: normalizeModuleOptions,

  printNodeOptions: printNodeOptions,

  isCi: function isCi() {
    return _isCi;
  },
  getEnvOverrides: function getEnvOverrides() {
    return _.chain({}).extend(util.getEnvColors()).extend(util.getForceTty()).omitBy(_.isUndefined) // remove undefined values
    .mapValues(function (value) {
      // stringify to 1 or 0
      return value ? '1' : '0';
    }).value();
  },
  getForceTty: function getForceTty() {
    return {
      FORCE_STDIN_TTY: util.isTty(process.stdin.fd),
      FORCE_STDOUT_TTY: util.isTty(process.stdout.fd),
      FORCE_STDERR_TTY: util.isTty(process.stderr.fd)
    };
  },
  getEnvColors: function getEnvColors() {
    var sc = util.supportsColor();

    return {
      FORCE_COLOR: sc,
      DEBUG_COLORS: sc,
      MOCHA_COLORS: sc ? true : undefined
    };
  },
  isTty: function isTty(fd) {
    return tty.isatty(fd);
  },
  supportsColor: function supportsColor() {
    // if we've been explictly told not to support
    // color then turn this off
    if (process.env.NO_COLOR) {
      return false;
    }

    // https://github.com/cypress-io/cypress/issues/1747
    // always return true in CI providers
    if (process.env.CI) {
      return true;
    }

    // ensure that both stdout and stderr support color
    return Boolean(_supportsColor.stdout) && Boolean(_supportsColor.stderr);
  },
  cwd: function cwd() {
    return process.cwd();
  },
  pkgVersion: function pkgVersion() {
    return pkg.version;
  },
  exit: function exit(code) {
    process.exit(code);
  },
  logErrorExit1: function logErrorExit1(err) {
    logger.error(err.message);

    process.exit(1);
  },
  titleize: function titleize() {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    // prepend first arg with space
    // and pad so that all messages line up
    args[0] = _.padEnd(' ' + args[0], 24);

    // get rid of any falsy values
    args = _.compact(args);

    return chalk.blue.apply(chalk, _toConsumableArray(args));
  },
  calculateEta: function calculateEta(percent, elapsed) {
    // returns the number of seconds remaining

    // if we're at 100 already just return 0
    if (percent === 100) {
      return 0;
    }

    // take the percentage and divide by one
    // and multiple that against elapsed
    // subtracting what's already elapsed
    return elapsed * (1 / (percent / 100)) - elapsed;
  },
  secsRemaining: function secsRemaining(eta) {
    // calculate the seconds reminaing with no decimal places
    return (_.isFinite(eta) ? eta / 1000 : 0).toFixed(0);
  },
  setTaskTitle: function setTaskTitle(task, title, renderer) {
    // only update the renderer title when not running in CI
    if (renderer === 'default') {
      task.title = title;
    }
  },
  isInstalledGlobally: function isInstalledGlobally() {
    return _isInstalledGlobally;
  },
  isSemver: function isSemver(str) {
    return (/^(\d+\.)?(\d+\.)?(\*|\d+)$/.test(str)
    );
  },
  isExecutableAsync: function isExecutableAsync(filePath) {
    return Promise.resolve(executable(filePath));
  },
  getOsVersionAsync: function getOsVersionAsync() {
    return Promise.try(function () {
      if (os.platform() === 'linux') {
        return getosAsync().then(function (osInfo) {
          return [osInfo.dist, osInfo.release].join(' - ');
        }).catch(function () {
          return os.release();
        });
      } else {
        return os.release();
      }
    });
  },


  // attention:
  // when passing relative path to NPM post install hook, the current working
  // directory is set to the `node_modules/cypress` folder
  // the user is probably passing relative path with respect to root package folder
  formAbsolutePath: function formAbsolutePath(filename) {
    if (path.isAbsolute(filename)) {
      return filename;
    }
    return path.join(process.cwd(), '..', '..', filename);
  },
  getEnv: function getEnv(varName) {
    var envVar = process.env[varName];
    var configVar = process.env['npm_config_' + varName];
    var packageConfigVar = process.env['npm_package_config_' + varName];
    if (envVar) {
      debug('Using ' + varName + ' from environment variable');
      return envVar;
    }
    if (configVar) {
      debug('Using ' + varName + ' from npm config');
      return configVar;
    }
    if (packageConfigVar) {
      debug('Using ' + varName + ' from package.json config');
      return packageConfigVar;
    }
    return undefined;
  },
  getCacheDir: function getCacheDir() {
    return cachedir('Cypress');
  },
  isPostInstall: function isPostInstall() {
    return process.env.npm_lifecycle_event === 'postinstall';
  },


  exec: execa,

  stdoutLineMatches: stdoutLineMatches
};

module.exports = util;