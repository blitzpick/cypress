'use strict';

var _templateObject = _taggedTemplateLiteral(['\n    runs Cypress in the browser with the given name.\n    note: using an external browser will not record a video.\n  '], ['\n    runs Cypress in the browser with the given name.\n    note: using an external browser will not record a video.\n  ']);

function _taggedTemplateLiteral(strings, raw) { return Object.freeze(Object.defineProperties(strings, { raw: { value: Object.freeze(raw) } })); }

var _ = require('lodash');
var commander = require('commander');

var _require = require('common-tags'),
    oneLine = _require.oneLine;

var debug = require('debug')('cypress:cli');
var util = require('./util');
var logger = require('./logger');
var cache = require('./tasks/cache');

// patch "commander" method called when a user passed an unknown option
// we want to print help for the current command and exit with an error
function unknownOption(flag) {
  var type = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'option';

  if (this._allowUnknownOption) return;
  logger.error();
  logger.error('  error: unknown ' + type + ':', flag);
  logger.error();
  this.outputHelp();
  logger.error();
  process.exit(1);
}
commander.Command.prototype.unknownOption = unknownOption;

var coerceFalse = function coerceFalse(arg) {
  return arg !== 'false';
};

var parseOpts = function parseOpts(opts) {
  opts = _.pick(opts, 'project', 'spec', 'reporter', 'reporterOptions', 'path', 'destination', 'port', 'env', 'cypressVersion', 'config', 'record', 'key', 'browser', 'detached', 'headed', 'global', 'dev', 'force', 'exit', 'cachePath', 'cacheList', 'cacheClear', 'parallel', 'group', 'ciBuildId');

  if (opts.exit) {
    opts = _.omit(opts, 'exit');
  }

  debug('parsed cli options', opts);

  return opts;
};

var descriptions = {
  record: 'records the run. sends test results, screenshots and videos to your Cypress Dashboard.',
  key: 'your secret Record Key. you can omit this if you set a CYPRESS_RECORD_KEY environment variable.',
  spec: 'runs a specific spec file. defaults to "all"',
  reporter: 'runs a specific mocha reporter. pass a path to use a custom reporter. defaults to "spec"',
  reporterOptions: 'options for the mocha reporter. defaults to "null"',
  port: 'runs Cypress on a specific port. overrides any value in cypress.json.',
  env: 'sets environment variables. separate multiple values with a comma. overrides any value in cypress.json or cypress.env.json',
  config: 'sets configuration values. separate multiple values with a comma. overrides any value in cypress.json.',
  browser: oneLine(_templateObject),
  detached: 'runs Cypress application in detached mode',
  project: 'path to the project',
  global: 'force Cypress into global mode as if its globally installed',
  version: 'prints Cypress version',
  headed: 'displays the Electron browser instead of running headlessly',
  dev: 'runs cypress in development and bypasses binary check',
  forceInstall: 'force install the Cypress binary',
  exit: 'keep the browser open after tests finish',
  cachePath: 'print the cypress binary cache path',
  cacheList: 'list the currently cached versions',
  cacheClear: 'delete the Cypress binary cache',
  group: 'a named group for recorded runs in the Cypress dashboard',
  parallel: 'enables concurrent runs and automatic load balancing of specs across multiple machines or processes',
  ciBuildId: 'the unique identifier for a run on your CI provider. typically a "BUILD_ID" env var. this value is automatically detected for most CI providers'
};

var knownCommands = ['version', 'run', 'open', 'install', 'verify', '-v', '--version', 'help', '-h', '--help', 'cache'];

var text = function text(description) {
  if (!descriptions[description]) {
    throw new Error('Could not find description for: ' + description);
  }

  return descriptions[description];
};

function includesVersion(args) {
  return _.includes(args, 'version') || _.includes(args, '--version') || _.includes(args, '-v');
}

function showVersions() {
  debug('printing Cypress version');
  return require('./exec/versions').getVersions().then(function () {
    var versions = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    logger.log('Cypress package version:', versions.package);
    logger.log('Cypress binary version:', versions.binary);
    process.exit(0);
  }).catch(util.logErrorExit1);
}

module.exports = {
  init: function init(args) {
    if (!args) {
      args = process.argv;
    }

    var program = new commander.Command();

    // bug in commaner not printing name
    // in usage help docs
    program._name = 'cypress';

    program.command('help').description('Shows CLI help and exits').action(function () {
      program.help();
    });

    program.option('-v, --version', text('version')).command('version').description(text('version')).action(showVersions);

    program.command('run').usage('[options]').description('Runs Cypress tests from the CLI without the GUI').option('--record [bool]', text('record'), coerceFalse).option('--headed', text('headed')).option('-k, --key <record-key>', text('key')).option('-s, --spec <spec>', text('spec')).option('-r, --reporter <reporter>', text('reporter')).option('-o, --reporter-options <reporter-options>', text('reporterOptions')).option('-p, --port <port>', text('port')).option('-e, --env <env>', text('env')).option('-c, --config <config>', text('config')).option('-b, --browser <browser-name>', text('browser')).option('-P, --project <project-path>', text('project')).option('--parallel', text('parallel')).option('--group <name>', text('group')).option('--ci-build-id <id>', text('ciBuildId')).option('--no-exit', text('exit')).option('--dev', text('dev'), coerceFalse).action(function (opts) {
      debug('running Cypress');
      require('./exec/run').start(parseOpts(opts)).then(util.exit).catch(util.logErrorExit1);
    });

    program.command('open').usage('[options]').description('Opens Cypress in the interactive GUI.').option('-p, --port <port>', text('port')).option('-e, --env <env>', text('env')).option('-c, --config <config>', text('config')).option('-d, --detached [bool]', text('detached'), coerceFalse).option('-P, --project <project path>', text('project')).option('--global', text('global')).option('--dev', text('dev'), coerceFalse).action(function (opts) {
      debug('opening Cypress');
      require('./exec/open').start(parseOpts(opts)).catch(util.logErrorExit1);
    });

    program.command('install').usage('[options]').description('Installs the Cypress executable matching this package\'s version').option('-f, --force', text('forceInstall')).action(function (opts) {
      require('./tasks/install').start(parseOpts(opts)).catch(util.logErrorExit1);
    });

    program.command('verify').usage('[options]').description('Verifies that Cypress is installed correctly and executable').action(function (opts) {
      var defaultOpts = { force: true, welcomeMessage: false };
      var parsedOpts = parseOpts(opts);
      var options = _.extend(parsedOpts, defaultOpts);
      require('./tasks/verify').start(options).catch(util.logErrorExit1);
    });

    program.command('cache').usage('[command]').description('Manages the Cypress binary cache').option('list', text('cacheList')).option('path', text('cachePath')).option('clear', text('cacheClear')).action(function (opts) {
      if (opts.command || !_.includes(['list', 'path', 'clear'], opts)) {
        unknownOption.call(this, 'cache ' + opts, 'sub-command');
      }
      cache[opts]();
    });

    debug('cli starts with arguments %j', args);
    util.printNodeOptions();

    // if there are no arguments
    if (args.length <= 2) {
      debug('printing help');
      program.help();
      // exits
    }

    // Deprecated Catches

    var firstCommand = args[2];
    if (!_.includes(knownCommands, firstCommand)) {
      debug('unknown command %s', firstCommand);
      logger.error('Unknown command', '"' + firstCommand + '"');
      program.outputHelp();
      return util.exit(1);
    }

    if (includesVersion(args)) {
      // commander 2.11.0 changes behavior
      // and now does not understand top level options
      // .option('-v, --version').command('version')
      // so we have to manually catch '-v, --version'
      return showVersions();
    }
    debug('program parsing arguments');
    return program.parse(args);
  }
};

if (!module.parent) {
  logger.error('This CLI module should be required from another Node module');
  logger.error('and not executed directly');
  process.exit(-1);
}