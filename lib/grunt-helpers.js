/**
 * Copyright 2012 Thanasis Polychronakis. Some Rights Reserved.
 *
 * =======================
 *
 * helpers.js Helper functions for grunt closure tools
 */
var exec  = require('child_process').exec,
    gzip  = require('zlib').gzip,
    fs    = require('fs'),
    crypto   = require('crypto'),
    when     = require('when'),
    grunt = require('grunt');

var helpers = module.exports = {};


helpers.log = {
  warn: function(msg) { console.log(msg); },
  info: function(msg) { console.log(msg); },
  error: function(msg) { console.log(msg); },
  debug: function(debug, msg) {
    if ( !debug ) return;
    console.log('DEBUG :: ', msg);
  }
};

/**
 * Generates a parameter to be concatenated to the shell command.
 * Will determine if given parameter is an array, a string or null and
 * takes proper action.
 *
 * @param {string|Array|null} param parameter to examine
 * @param {string} directive The directive (e.g. from -p path/to the '-p')
 * @param {boolean=} optNoSpace set to true if no space is required after directive
 * @param {boolean=} optParsePath If true each param item will be handled as
 *                                 a path and parsed via grunt expandFiles.
 * @return {string} " -p path/to" or if array " -p path/one -p path/two [...]"
 *      in case param is null, we simply return the directire (" -p")
 */
helpers.makeParam = function makeParam(param, directive,
    optNoSpace, optParsePath) {

  // use space or not after directive
  var sp = (optNoSpace ? '' : ' ');

  var paramValue = param;
  if (optParsePath) {
    paramValue = grunt.file.expand(param);
  }

  if (Array.isArray(param)) {
    if (optParsePath){
      paramValue = [];
      for(var i = 0, len = param.length; i < len; i++) {
        paramValue.push(grunt.file.expand(param[i]));
      }
    }
    return ' ' + directive + sp + paramValue.join(' ' + directive + sp);
  } else if (null === param){
    return ' ' + directive;
  } else {
    return ' ' + directive + sp + String(paramValue);
  }
};

/**
 * Will shell execute the given command
 *
 * @param {string} command.
 * @param {Function} done callback to call when done.
 * @param  {boolean=}   optSilent Suppress stdout messages.
 * @return {void}
 */
helpers.executeCommand = function executeCommand( command, done, optSilent ) {

  if ( !optSilent ) helpers.log.info('Executing: '.blue + command);

  exec(command, function execCB(err, stdout, stderr) {
    if ( err ) {
      helpers.log.error( err );
      done(false, stderr, stdout);
      return;
    }

    if ( !optSilent ) helpers.log.info(stdout || stderr);
    done(true);
  });
};


/**
 * Get the gzip sized of file.
 * @param  {string}   file     [description]
 * @param  {Function} callback [description]
 * @return {when.Promise} a promise.
 */
helpers.gzipSize = function( file, callback ) {
  return helpers.gzipfile(file).then(function(res){
    callback(res.length);
  }).otherwise(function(){
    callback(NaN);
  });
};

/**
 * Generate stats for the compiled output file
 *
 * @param {string} filePath path to compiled file
 * @param {Function(string=)} fn Callback
 */
helpers.generateStats = function genStats( filePath, fn ) {
  helpers.gzipSize( filePath, function( gzipSize ) {
    if (!gzipSize) {
      fn(false);
      return;
    }
    var src = grunt.file.read( filePath ),
        compiledSize = src.length,
        percent = String('-' + ((1 - (gzipSize / compiledSize)) * 100).toFixed(2) + '%');

    helpers.log.info('Compiled size:\t' + String((compiledSize / 1024).toFixed(2)).green +
      ' kb \t(' + String(compiledSize).green + ' bytes)');
    helpers.log.info('GZipped size:\t' + String((gzipSize / 1024).toFixed(2)).green +
      ' kb \t(' + String(gzipSize).green + ' bytes) ' + percent);

    fn(true);
  });
};

/**
 * Checks existence of a file (allows symlinks)
 *
 * @param {string} filePath path to check
 * @return {boolean} Wether the file exists.
 */
helpers.fileExists = function fileExists( filePath ) {
  try {
    var stat = fs.lstatSync(filePath);
    if (stat.isFile() || stat.isSymbolicLink())
      return true;
  } catch (ex) {}
  return false;
};

/**
 * Execute the compile command on the shell.
 * @param  {Array} commands Array of commandObj objects.
 * @param  {Function} cb the callback to call when done.
 * @param  {boolean=}   optSilent Silence output.
 */
helpers.runCommands = function runCommands( commands, cb , optSilent) {

  var commandObj = commands.shift();

  if ( !commandObj ) {
    // done
    cb(true);
    return;
  }

  helpers.executeCommand( commandObj.cmd , function execCB( state, stderr, stdout ) {
    if ( state ) {
      if (!optSilent) helpers.log.info( 'Command complete for target: ' + commandObj.dest );
    helpers.runCommands( commands, cb, optSilent);
    } else {
      if ( 'string' !== typeof(commandObj.dest)) {
        commandObj.dest = 'undefined';
      }
      helpers.log.error('FAILED to run command for target: ' + commandObj.dest.red);
      cb(false, stderr, stdout);
    }
  }, optSilent);
};

/**
 * [runStats description]
 * @param  {[type]}   commands [description]
 * @param  {[type]}   options  [description]
 * @param  {Function} cb       [description]
 * @return {[type]}            [description]
 */
helpers.runStats = function runStats( commands, options, cb) {
  var commandObj = commands.shift();

  if ( !commandObj ) {
    // done
    cb(true);
    return;
  }

  // check if we compiled
  if ( options.compile ) {

    var dest = commandObj.fileObj.dest;
    if (dest && dest.length) {
      helpers.log.info('File statistics for ' + dest.green);
      helpers.generateStats( dest , function() {
        helpers.runStats ( commands, options, cb );
      });
    }
  } else {
    // nothing todo
    cb(true);
  }


};

/**
 * Some ascii art
 * @param  {string} message [description]
 * @return {string}         [description]
 */
helpers.getWarn = function( message ) {
  var out = '';

  out += '\n\n\n';
  out += '#################################\n';
  out += '#################################';
  out += '\n\n';
  out += message;
  out += '\n\n';
  out += '#################################\n';
  out += '#################################';

  return out;
};

/**
 * Reoslve our cwd and prepend proper path to provided filepath.
 *
 * @param  {string} filePath Any string.
 * @return {string} properly prefixed path.
 */
helpers.getPath = function( filePath ) {
  return __dirname + '/../' +  filePath;
};

/**
 * Returns all the .js files excluding dangerous directories line node_modules
 *
 * @param  {string} directory The path to the directory we want to scan.
 * @return {Array.<string>} An array of strings, the .js files.
 * @deprecated Not used, chose another path, remains in case of future neeed.
 */
helpers.getJSTargets = function ( directory ) {
  var exclude = [
    'node_modules/**',
    'deps.js'
  ];

  var expandOpts = [ directory + '/**/*.js' ];
  exclude.forEach( function( excl ) {
    expandOpts.push( '!' + directory + '/' + excl );
  });
  var output = grunt.file.expand(expandOpts);

  return output;
};

/**
 * Get the md5 hash of a file.
 *
 * @param  {string} filename the filename.
 * @param  {Function(string)=} optCb callback with the md5 hash as argument.
 * @return {when.Promise} a promise
 */
helpers.md5file = function( filename, optCb ) {
  var md5sum = crypto.createHash('md5'),
      fileContents = '',
      streamFile = fs.ReadStream(filename),
      def = when.defer(),
      cb = optCb || function(){};

  streamFile.on('data', function(d) {
    fileContents += d;
    md5sum.update(d);
  });

  streamFile.on('end', function() {
    var hash = md5sum.digest('hex');
    def.resolve( hash );
    cb( hash );
  });

  return def.promise;
};

/**
 * fs.lstat that returns a promise
 *
 * @param  {string} filename [description]
 * @return {when.Promise}          [description]
 */
helpers.getStat =  function( filename ) {
  var def = when.defer();
  fs.lstat( filename, function(err, stat) {
    if (err) {
      def.reject( 'lstat failed:' + err);
      return;
    }

    def.resolve(stat);
  });
  return def.promise;
};

/**
 * Gzip with a promise.
 *
 * @param  {string} filename [description]
 * @return {when.Promise}          [description]
 */
helpers.gzipfile = function( filename ) {
  var def = when.defer();

  gzip( grunt.file.read( filename ), function(err, result) {
    if (err) {
      def.reject(err);
    } else {
      def.resolve(result);
    }
  });

  return def;
};
