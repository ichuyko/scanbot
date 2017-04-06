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

let i = 1;


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


    cnt = cnt + 1;

    const isURLtoFile = callStat("isURLTOFILEValidator", to_url, function() {
      return isURLTOFILEValidator(to_url);
    })

    if (isURLtoFile) {
      console.log(
          "SKIP URL by content type Validator! Looks like it's URL to file: " +
          to_url);
      return;
    }

    const from_URL = toURL(from_url);
    const to_URL = callStat("to_URL", to_url, function() {
      return toURL(to_url);
    })

    //insert to scan_raw mongo
    // let timestamp = (new Date()).getTime();
    // collection_scan_raw.insertOne({
    //   type: 1,
    //   date: timestamp,
    //   version: 0,
    //   priority: 3,
    //   from: from_URL,
    //   from_scan_id: from_URL.scan_id,
    //   to: to_URL,
    //   to_scan_id: to_URL.scan_id,
    //   deep: maxDeep - deep
    // }).then(function(result) {
    //   console.log("Inserted to scan_raw");
    // }).catch(function(error) {
    //   console.log("ERROR: Insert to scan_raw:");
    //   console.log(error);
    // });


    //
    // // let from_URL2 = toURL("http://facebook.com/about/ivandj");
    // let from_URL2 = toURL("http://info.home.facebook.com/ivandj");
    // // let to_URL2 = toURL("http://ok.mail.ru/profile/ivandj/");
    // let from_domain = {}, to_domain = {};
    // let from_incPath, to_incPath;
    //
    // from_incPath = getSubDomainsObj(from_domain, from_URL2);
    // // to_incPath = getSubDomainsObj(to_domain, to_URL2);
    //
    // let from_FROM = {};
    // from_FROM.from = from_incPath;
    //
    //
    // // all pathname (scan_id)
    // if (from_incPath) {
    //   collection_domain.updateOne(from_incPath.find, from_incPath.update).then(function(up_data) {
    //     console.log(up_data);
    //
    //     // db.domain.update({"subdomain.subdomain.paths.path": "/contact"} , {$inc: {"subdomain.subdomain.paths.$.count": 1}})
    //     collection_domain.updateOne(from_incPath.findInc, from_incPath.updateInc).then(function(inc_data) {
    //       console.log(inc_data);
    //
    //
    //     });
    //
    //   });
    // }

    // return;

    // collection_domain.findOneAndUpdate({dom:123}, {dom:123, count:1}).then(function(result) {
    // // collection_domain.findOneAndUpdate({dom:123}, {$inc : {count: 1}}).then(function(result) {
    //   console.log("Inserted to scan_raw");
    //
    // }).catch(function(error) {
    //   console.log("ERROR: Insert to scan_raw:");
    //   console.log(error);
    // });







    let dom = domain[to_URL.scan_id];
    if (!dom){
      let nd = {};
      nd.cont = 1;
      nd["from_" + nd.cont] = from_url;
      domain[to_URL.scan_id] = nd;

      // upsetDomain(to_URL.hostname);

    } else {
      dom.cont = dom.cont+1;
      dom["from_" + dom.cont] = from_url;
      console.log("[" + cnt + ", " + deep + "] " + "SKIP DOUBLE SCAN of " + to_URL.host + " FROM " + from_url);
      return;
    }



    console.log("[" + cnt + ", " + deep + "] " + from_url + " => " + to_url + "  ] =============");
    // console.log("Send request: " + new Date());

    if (deep == 0) {
      console.log("[" + cnt + ", " + deep + "] " + "stop by deep : " + to_url)
      return;
    }

    // console.log("[" + cnt + ", " + deep + "] " + "Deep[" + deep + "]: " + "scan FROM " + from_url + " TO " + to_url)

    cntScan = cntScan + 1;
    console.log("cntScan = " + cntScan);
    let ops = {timeout:6000};//, agent: "Mozilla/5.0 (iPad; CPU OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B143 Safari/601.1"};
    got(to_url, ops)
    .then(response => {
      // console.log("Response: " + new Date());
      //
      // console.log("response.headers.server: " + response.headers.server);
      // console.log("Response: " + response.body);

      // parseBody(response.body);
      console.log("[" + cnt + ", " + deep + "] " + "scan RESPONSE FROM " + from_url + " TO " + to_url)

      let contentType = response.headers["content-type"];
      if (!contentType.includes("text/html")){
        console.log("SKIP content-type : " + contentType + "   FROM   " + to_url);
        return;
      }
      parseBody(response.body, from_URL, to_URL, deep).then(function(parse_result) {

        if (parse_result && parse_result.a && parse_result.a.length > 0){
          let newURLs = [];
          parse_result.a.forEach(function(a_href) {
            let timestamp = (new Date()).getTime();
            newURLs.push({timestamp: timestamp, priority: 3, version: 0, url: a_href, deep: parse_result.deep, from_url: parse_result.from_URL});
          });


          collection_scan_raw.insertMany(newURLs).then(function(r) {
            console.log(r.insertedCount);
          });
        }


      });
    })
    .catch(error => {
      console.log("GOT Error: " + error);

    });


    // var options = {};
    // curl.get(to_url, options, function(err, response, body) {
    //   console.log("Response: " + new Date());
    //
    //   console.log("response.headers.server: " + response.headers.server);
    //   console.log("Response: " + body);
    //   parseBody(body);
    // });



  });
}

function parseBody(body, from_URL, to_URL, deep){
  return new Promise(function(resolve, reject) {

    let parse_result = {a:[], script:[], css:[], img:[], link: []};
    let parser = new htmlparser.Parser({
      onopentag: function(name, attribs){

        if(name === "script"){
          console.log("type: " + attribs.type);
          console.log("src: " + attribs.src);
          let src = attribs.src;
          if (src && src.startsWith("//"))
            src = to_URL.protocol + src;

          if (src)
            parse_result.script.push({type: attribs.type, src: src});
        } else if(name === "a"){
          // console.log("href: " + attribs.href);
          if (attribs && attribs.href && attribs.href.length > 2 ) {
            // //mail.ru ???? //attribs.href.startsWith("http")
            let href = attribs.href;
            if (href.startsWith("//"))
              href = to_URL.protocol + href;

            let next_URL = toURL(href);
            if (to_URL.scan_id != next_URL.scan_id && href.startsWith("http")){

              // let val  = callStat("isWWWValidator", to_URL.host + " vs " + next_URL.host, function (){return isWWWValidator(to_URL, next_URL);})
              if (!isSubValidator(to_URL, next_URL))
                if (!isURLTOFILEValidator(href))
                  parse_result.a.push(href);



              // if (!val && !val2)
                // if (!val)
                // scan(to_URL.href, attribs.href, deep + 1);
                // else
                //   console.log("SKIP: " + to_URL.host + "   ===   " + next_URL.host);
            }
          }
        } else if(name === "link"){
          console.log("rel: " + attribs.rel);
          console.log("type: " + attribs.type);
          console.log("href: " + attribs.href);
          let href = attribs.href;
          if (href && href.startsWith("//"))
            href = to_URL.protocol + href;

          parse_result.link.push({rel: attribs.rel, type: attribs.type, href: href});
        } else if(name === "img"){
          console.log("src: " + attribs.src);
          let src = attribs.src;
          if (src.startsWith("//"))
            src = to_URL.protocol + src;

          //skip domian and subdomain links!
          if (!isSubValidator(to_URL, toURL(src)))
            parse_result.img.push(src);
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

function isSubValidator(URL1, URL2){
  // console.log(URL1.host + " vs " + URL2.host)
  if (URL1.hostNoWWW == URL2.hostNoWWW)
    return true;

  let host1; // small
  let host2; // bigger

  if (URL1.host.length < URL2.host.length){
    host1 = URL1.host;
    host2 = URL2.host;
  } else {
    host1 = URL2.host;
    host2 = URL1.host;
  }

  if (host1.startsWith("www."))
    host1 = host1.replace("www.", "");

  if (host2.startsWith("www."))
    host2 = host2.replace("www.", "");


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
  console.log("Uptime: " + process.uptime());
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
              console.log("Queue '" + ctx.id + "' is empty! Starts 5 sec monitor...");
              ctx.priority = 0;
              setTimeout(function() {
                ctx.nextCall(ctx);
              }, 5000);
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

  // scan("", "http://www.1tv.ru/", 2);
  // scan("", "http://yahoo.com", 0);
  // scan("", "http://cnn.com", 0);
  // scan("", "http://yandex.ru", 0);
  // scan("", "http://ya.ru", 0);
  // scan("", "http://google.com", 0);
  // scan("", "https://en.wikipedia.org/wiki/List_of_most_popular_websites", 0);
  // scan("", "http://www.alexa.com/topsites", 0);
  // scan("", "https://www.redflagnews.com/top-100-conservative/", 0);


  if (1===4)
  registerQProcessor("location",
      function (p, ctx){
        return new Promise(function(resolve) {
          collection_domain.findOne({"priority" : p, "version" : 0}, {_id:true, domain:true}).then(function (oneDoc) {

            console.log((new Date()).getTime() + " : " + "Queue '" + ctx.id + "' : Priority : " + p);
            console.log((new Date()).getTime() + " : " + "Queue '" + ctx.id + "' : " + ((!oneDoc) ? "No items " : oneDoc.domain));
            // console.log(oneDoc);
            // console.dir(docs);
            // if (typeof _dataCallback !== 'function') {
            //   console.log("WTF2 ?!");
            // }

            resolve(oneDoc);
          });

        });
      }, function(data) {
        return new Promise(function(resolve){

          let updateRec = function(version, data, ipData, _resolve){
            console.log((new Date()).getTime() + " : " + data.domain)
            collection_domain.updateOne({ _id: new ObjectID(data._id.toString()) }, { $set: { location : ipData , version : version} })
            .then(function(result) {
              console.log((new Date()).getTime() + " : " + "Updated the document. Next...");
              _resolve();
            });

          };

          ipLocation(data.domain)
          .then(function (ipData) {
            updateRec(1, data, ipData, resolve);
          })
          .catch(function (err) {
            updateRec(2, data, null, resolve);
          });


        });
      }, true, 3, 50
  );

  registerQProcessor("deep_scan",
      function (p, ctx){
        return new Promise(function(resolve) {
          collection_scan_raw.findOne({"priority" : p, "version" : 0}).then(function (oneDoc) {

            console.log((new Date()).getTime() + " : " + "Queue '" + ctx.id + "' : Priority : " + p);
            console.log((new Date()).getTime() + " : " + "Queue '" + ctx.id + "' : " + ((!oneDoc) ? "No items " : oneDoc.domain));

            resolve(oneDoc);
          });

        });
      }, function(data) {
        return new Promise(function(resolve){

          let updateRec = function(version, data, ipData, _resolve){
            console.log((new Date()).getTime() + " : " + data.domain)
            collection_domain.updateOne({ _id: new ObjectID(data._id.toString()) }, { $set: { location : ipData , version : version} })
            .then(function(result) {
              console.log((new Date()).getTime() + " : " + "Updated the document. Next...");
              _resolve();
            });

          };

          ipLocation(data.domain)
          .then(function (ipData) {
            updateRec(1, data, ipData, resolve);
          })
          .catch(function (err) {
            updateRec(2, data, null, resolve);
          });


        });
      }, true, 3, 50
  );


}