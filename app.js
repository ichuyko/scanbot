const
    got = require('got');
    URL = require('url-parse'),
    htmlparser = require("htmlparser2"),
    MongoClient = require('mongodb').MongoClient,
    ObjectID = require('mongodb').ObjectID,
    assert = require('assert'),
    ipLocation = require('ip-location'),
    Promise = require("bluebird");

const mongoDB = 'mongodb://localhost:27017/scanbot';
var db;
var collection_domain;
var collection_scan_raw;

//load on app start from mongo!
// {host: facebook.com}
var scanned_hosts = {};

let cnt = 0;
let cntScan = 0;
let domain = {};
let statObj = {};

let netTimeAccess = 0;
let netTimeAccessStart;


function toURL(url) {
  let URL_obj = new URL(url);
  let d = URL_obj.hostname.split('.');
  let len = d.length;
  let isSecondLevelDomain = true;

  if (len === 1)
    URL_obj.domain = "";
  else if (len === 2)
    URL_obj.domain = URL_obj.hostname;
  else {
    URL_obj.domain = d[len - 2] + "." + d[len - 1];
    isSecondLevelDomain = false;
  }
  URL_obj.isSecondLevelDomain = isSecondLevelDomain;

  //cut "www." from host
  let hostNoWWW = URL_obj.host;
  len = hostNoWWW.length;
  if (len > 4 && hostNoWWW.startsWith("www."))
    hostNoWWW = hostNoWWW.substring(4, len);
  URL_obj.hostNoWWW = hostNoWWW;


  let scan_id = URL_obj.hostNoWWW + URL_obj.pathname;
  len = scan_id.length;
  if (len > 1) {
      if (scan_id[len - 1] == "/")
        scan_id = scan_id.substring(0, len-1);
    }
    URL_obj.scan_id = scan_id;
    URL_obj.isPathname = (URL_obj.pathname.length > 0 &&
    URL_obj.pathname !== "/");
    return URL_obj;
}

function getDomain(domain){
  return new Promise(function(resolve, reject) {
    collection_domain.findOne({"domain" : domain}, {_id:true, domain:true}).then(function (oneDoc) {
      resolve(oneDoc);
    }).catch(function(error) {
      console.log((new Date()).getTime() + " : ERROR");
      console.log(error);
      reject(error);
    })
  });
}

function insertNewDomain(new_URL){
  return new Promise(function(resolve, reject) {
    let subDomain = new_URL.hostname.replace('.', ',');
    let newDomainRec = {"domain" : new_URL.domain, count:1};
    newDomainRec[subDomain] =  {count : 1};

    collection_domain.insertOne(newDomainRec).then(function (oneDoc) {
      resolve(newDomainRec);
    }).catch(function(error) {
      reject(error);
    })
  });
}

function getSubDomainsObj(domain, _URL){
  let path = "";
  let curr_path;

  if (_URL.isSecondLevelDomain) {
    curr_path = _URL.hostname;//.replace('.', ',');
    domain["subdomain"] = {domain: curr_path, count: "+1"};
    // path.push(curr_path);
  } else {
    let doms = _URL.hostname.split('.');
    let len = doms.length;
    let prev = doms[len - 2] + "." + doms[len - 1];
    let obj = {domain: prev, count: "+1"};
    let curr_obj;
    path = path + "subdomain.";

    curr_obj = domain;
    for (let i = len - 3; i >= 0; i--) {
      curr_path = doms[i] + "." + prev
      curr_obj["subdomain"] = {domain: curr_path, count: "+1"};
      prev = curr_path;
      path = path + "subdomain.";
      curr_obj = curr_obj["subdomain"];
    }
  }

  let up = undefined;

  if (_URL.isPathname) {
    let find = {};
    find[path + "domain"] = curr_path;
    let update = {};
    update[path + "paths"] = {$addToSet : {path: _URL.pathname}};

    // {"subdomain.subdomain.paths.path": "/contact"} , {$inc: {"subdomain.subdomain.paths.$.count": 1}}
    let incFind = {};
    incFind[path + "paths.path"] = {path: _URL.pathname};
    let incUpdate = {};
    let v = {};
    v[path + "paths.$.count"] = 1;
    incUpdate[path + "paths.path"] = {$inc: v};

    up = {find: find, update: update, incFind: incFind, incUpdate: incUpdate};
  }

  return up;
}

function scan(from_url, to_url, deep) {
  return new Promise(function(resolve, reject) {

    if (deep === 0){
      reject();
      return;
    }

    const from_URL = toURL(from_url);
    const to_URL = callStat("to_URL", to_url, function() {
      return toURL(to_url);
    })

    collection_scan_raw.findOne({"to_url.scan_id" : to_URL.scan_id, version : {$ne : 0}}).then(function (oneRec) {
      if (oneRec) {
        console.log((new Date()).getTime() + " : " + " Already scanned! " + to_url);
        resolve(getParseResponse(3, "Duplicate of " + to_url));//duplicate. already scanned
        return;
      }

      cntScan = cntScan + 1;
      console.log("cntScan = " + cntScan);
      console.log((new Date()).getTime() + " : " +"Loading... " + to_url);
      netTimeAccessStart = (new Date()).getTime();
      let ops = {};
      ops.timeout = 35 * 1000;
      // ops.headers = {"Timeout": "20000"};
      got(to_url, ops)
      // got("http://aawsat.com/english/default.asp", ops)
      .then(response => {
        netTimeAccess = netTimeAccess + ((new Date()).getTime() - netTimeAccessStart);
        console.log((new Date()).getTime() + " : " +"Scan RESPONSE FROM " + from_url + " TO " + to_url)

        let contentType = response.headers["content-type"];
        if (!contentType.includes("text/html")){
          console.log("SKIP content-type : " + contentType + "   FROM   " + to_url);
          resolve(getParseResponse(2, "Wrong content type : " + contentType));
          return;
        }

        parseBody(response.body, from_URL, to_URL, deep).then(function(parse_result) {

          if (parse_result && parse_result.a && parse_result.a.length > 0){
            let newURLs = [];
            parse_result.a.forEach(function(a_href) {
              let timestamp = (new Date()).getTime();
              let a_href_URL = toURL(a_href);
              newURLs.push({timestamp: timestamp, priority: 3, version: 0, to_url: a_href_URL, deep: parse_result.deep, from_url: parse_result.from_URL});
            });

            collection_scan_raw.insertMany(newURLs).then(function(r) {
              resolve(getParseResponse(1, "insertedCount : " + r.insertedCount));
            });
          } else {
            resolve(getParseResponse(1, "Nothing to insert"));
          }


        }).catch(function(error) {
          // reject(error);
          netTimeAccess = netTimeAccess + ((new Date()).getTime() - netTimeAccessStart);
          console.log((new Date()).getTime() + " : ERROR");
          console.log(error);
          resolve(getParseResponse(2, error.message));
        });
      })
      .catch(error => {
        // reject(error);
        netTimeAccess = netTimeAccess + ((new Date()).getTime() - netTimeAccessStart);
        console.log((new Date()).getTime() + " : ERROR");
        console.log(error);
        resolve(getParseResponse(2, error.message));
      });

    });



  });
}

function getParseResponse(version, message) {
  let resp = {};
  let timestamp = (new Date()).getTime();
  resp.version = version;
  resp.message = message;
  return resp;
}

function parseBody(body, from_URL, to_URL, deep){
  return new Promise(function(resolve, reject) {

    let parse_result = {a:[], script:[], css:[], img:[], link: []};
    let parser = new htmlparser.Parser({
      onopentag: function(name, attribs){
        let url;
        if(name === "script"){
          url = fixURL(attribs && attribs.src ? attribs.src : "", to_URL.protocol);
          if (url)
            parse_result.script.push({type: attribs.type, src: url});
        } else if(name === "a"){
          url = fixURL(attribs && attribs.href ? attribs.href : "", to_URL.protocol);
          // if (attribs && attribs.href && attribs.href.length > 2 ) {
          if (url){
            let next_URL = toURL(url);
            if (to_URL.scan_id != next_URL.scan_id){
              if (!isSubValidator(to_URL, next_URL))
                if (!isURLTOFILEValidator(url))
                  parse_result.a.push(url);
            }
          }
        } else if(name === "link"){
          url = fixURL(attribs && attribs.href ? attribs.href : "", to_URL.protocol);
          if (url)
            parse_result.link.push({rel: attribs.rel, type: attribs.type, href: url});
        } else if(name === "img"){
          url = fixURL(attribs && attribs.src ? attribs.src : "", to_URL.protocol);
          if (url && !isSubValidator(to_URL, toURL(url)))
            parse_result.img.push(url);
        }
      }
    }, {decodeEntities: true});


    parser.write(body);
    parser.end();

    parse_result.from_URL = to_URL;
    deep = deep - 1;
    parse_result.deep = deep;
    resolve(parse_result);
  });
}

function fixURL(url, protocol) {
  if (!url)
    return "";

  // url = url.trim();
  // if (url.indexOf('\t') != -1)
  //   console.log("TRIM? : " + url);
  // if (url.indexOf('\n') != -1)
  //   console.log("TRIM?? : " + url);

    url = url.replace(/\s/g, '')

    if (url.length < 2)
    return "";

  if (url.startsWith("//"))
    return protocol + url;
  else
    if (url.length > 4 && url.startsWith("http")) // skip file:// ftp:// mailto:   etc
      return url;
  else
    return "";

}

function isSubValidator(URL1, URL2){
  // console.log(URL1.host + " vs " + URL2.host)
  if (URL1.hostNoWWW == URL2.hostNoWWW)
    return true;

  let host1; // small
  let host2; // bigger

  if (URL1.host.length < URL2.host.length){
    host1 = URL1.hostNoWWW;
    host2 = URL2.hostNoWWW;
  } else {
    host1 = URL2.hostNoWWW;
    host2 = URL1.hostNoWWW;
  }

  if (host2.indexOf(host1) != -1)
    return true;
  else
    return false;

}

function isURLTOFILEValidator(url_to_file) {
  if (!url_to_file || url_to_file.length < 3)
    return false;

  if (url_to_file.substr(-1) === "/")
    return false;

  let result = false;

  let ext2 = url_to_file.substr(-3);
  if (ext2.startsWith('.')) {
    ext2 = ext2.toLowerCase();
    result = [".js"].includes(ext2);
    if (result)
      return true;
  }


  if (url_to_file.length < 4)
    return false;
  let ext3 = url_to_file.substr(-4);
  if (ext3.startsWith('.')) {
    ext3 = ext3.toLowerCase();
    if (ext3 == ".htm")
      return false;
    result = [
      ".pdf", ".exe", ".mov", ".mp4", ".mp3", ".avi", ".ppt", ".doc",
      ".xls", ".png", ".jpeg", ".bmp", ".gif"].includes(ext3);
    if (result)
      return true;
  }


  if (url_to_file.length < 5)
    return false;
  let ext4 = url_to_file.substr(-5);
  if (ext4.startsWith('.')) {
    ext4 = ext4.toLowerCase();
    if (ext4 == ".html")
      return false;
    result = [".jpeg", ".mpeg"].includes(ext4);
    if (result)
      return true;
  }


  return false;
}


function callStat(topic, info, callbackFunction){
  let d1 = new Date();
  let ret = callbackFunction();
  let d2 = new Date();
  saveStat(topic, d1, d2, info);
  return ret;
}

function saveStat(topic, d1, d2, info){
  let delta = d2.getTime() - d1.getTime();
  let curVal = statObj[topic];
  if (!curVal) {
    let o = {};
    o.maxTime = delta;
    o.info = info;
    o.timeTotal = delta;
    o.cnt = 1;
    statObj[topic] = o;
  } else {
    if (delta > curVal.maxTime) {
      curVal.maxTime = delta;
      curVal.info = info;
    }
    curVal.timeTotal = curVal.timeTotal + delta;
    curVal.cnt = curVal.cnt + 1;
  }
}

function upsetDomain(domain){

  // let collection = db.collection('domains');

  collection_domain.insertOne(
      {"domain" : domain, "version" : 3},
      function(err, result) {
        console.log("Inserted 1 documents into the collection: " + domain);

        // assert.equal(err, null);
        // assert.equal(3, result.result.n);
        // assert.equal(3, result.ops.length);
        // callback(result);
        // console.log("result:");
        // console.log(result);

        // process.exit(0);
      });

}

function onExit(args){
  console.log("================ " + args + " ===================");
  let uptime = process.uptime();
  let nettime = netTimeAccess/1000;
  console.log("Uptime: " + uptime);
  console.log("netTimeAccess: " + nettime   + "    " + (((nettime * 100) / uptime)) + " %");
  console.log("URLs: " + cntScan + "/" + cnt)
  console.log("================ Statistic ===================");
  // console.log(domain);
  console.log(statObj);

  if (db) {
    db.close();
    console.log("Connection closed");
  }
  process.exit(1);
}

process.on('exit', onExit);
process.on('SIGINT', onExit);
process.on('SIGTERM', onExit);

process.on('uncaughtException', (err) => {
  console.log(err);
});

let qProcess = {};

function registerQProcessor(id, getData, processData, autoStart, maxPriority, delay){
  let proc = qProcess[id];
  if (!!proc) return;

  proc = {};
  proc.id = id;
  proc.getData = getData;
  proc.processData = processData;
  proc.autoStart = autoStart;
  proc.maxPriority = maxPriority;
  proc.delay = delay;

  proc.priority = 0;

  proc.nextCall = function(ctx){
      setTimeout(function() {
        ctx.getData(ctx.priority, ctx).then(function(data) {
          if (!data) {
            //check for no data for any prioroty and extend delay! convert it to listener;
            //exit on no data for max p
            if (ctx.priority == ctx.maxPriority) {
              console.log("Queue '" + ctx.id + "' is empty! Starts 10 sec monitor...");
              ctx.priority = 0;
              setTimeout(function() {
                ctx.nextCall(ctx);
              }, 10000);
            } else {
              ctx.priority = ctx.priority + 1;
              ctx.nextCall(ctx);
            }

          } else {

            ctx.processData(data).then(function() {
              ctx.priority = 0;
              ctx.nextCall(ctx);
            });

          }



        });
      }, ctx.delay);
  };


  qProcess[id] = proc;
  if (autoStart)
    qProcess[id].nextCall(proc);
}



function connectToDB(){
  return new Promise(function(resolve, reject){
    // if (1==1) resolve();
    MongoClient.connect(mongoDB).then(function(_db){
      db = _db;
      collection_domain = db.collection('domain');
      collection_scan_raw = db.collection('scan_raw');
      console.log("Connected correctly to server");
      resolve(db);
    }).catch(function(err) {
      console.log("Connection to MongoDB error:");
      console.log(err);
      reject(err);
    });


  });
}


connectToDB().then(main);


function main(){

  console.log("main()");

  // scan("", "https://itunes.apple.com/ru/app/id507760450?mt=8&uo=4&at=11l9Wx&ct=autoru", 1);
  scan("", "http://www.1tv.ru/", 2);
  scan("", "http://yahoo.com", 3);
  scan("", "http://cnn.com", 3);
  scan("", "http://yandex.ru", 3);
  scan("", "http://ya.ru", 3);
  scan("", "http://google.com", 3);
  scan("", "https://en.wikipedia.org/wiki/List_of_most_popular_websites", 3);
  scan("", "http://www.alexa.com/topsites", 3);
  scan("", "https://www.redflagnews.com/top-100-conservative/", 3);


  if (1===4)
  registerQProcessor("location",
      function (p, ctx){
        return new Promise(function(resolve) {
          collection_scan_raw.findOne({"priority" : p, "version" : 1}, {_id:true, "to_url.hostname":true}).then(function (oneDoc) {
            resolve(oneDoc);
          });

        });
      }, function(data) {
        return new Promise(function(resolve){

          let updateRec = function(version, data, ipData, _resolve){
            let timestamp = (new Date()).getTime();
            collection_scan_raw.updateOne({ _id: new ObjectID(data._id.toString()) }, { $set: { to_url_location : ipData , version : version, timestamp : timestamp} })
            .then(function(result) {
              _resolve();
            });

          };

          console.log((new Date()).getTime() + " : " + " Detect Location for " + data.to_url.hostname);
          ipLocation(data.to_url.hostname)
          .then(function (ipData) {
            updateRec(4, data, ipData, resolve);
          })
          .catch(function (err) {
            updateRec(5, data, null, resolve);
          });


        });
      }, true, 3, 50
  );

  // if (11==3)
  registerQProcessor("deep_scan",
      function (p, ctx){
        return new Promise(function(resolve) {
          collection_scan_raw.findOne({$and : [{"priority" : p, "version" : 0}, {deep : {$ne : 0}}]}).then(function (oneDoc) {

            console.log((new Date()).getTime() + " : " + "Queue '" + ctx.id + "' : Priority : " + p);
            console.log((new Date()).getTime() + " : " + "Queue '" + ctx.id + "' : " + ((!oneDoc) ? "No items " : "_id=" + oneDoc._id.toString()));

            resolve(oneDoc);
          });

        });
      }, function(data) {
        return new Promise(function(resolve){
          scan(data.from_url.href, data.to_url.href, data.deep).then(function(parse_response) {
            let timestamp = (new Date()).getTime();
            collection_scan_raw.updateOne({ _id: new ObjectID(data._id.toString()) }, {$inc: {deep: -1}, $set : {version: parse_response.version, message:parse_response.message, timestamp : timestamp}, })
            .then(function(result) {
              console.log((new Date()).getTime() + " : " + "Updated the document from queue. Next...");
              resolve();
            });
          });
        });
      }, true, 3, 50
  );
}