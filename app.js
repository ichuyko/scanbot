const got = require('got');
const htmlparser = require("htmlparser2");
const URL = require('url-parse');

const maxDeep = 3;
let cnt = 0;
let cntScan = 0;
let startTime = new Date();
let domain = {};

function scan(from_url, to_url, deep){
  cnt = cnt + 1;

  if (isURLTOFILEValidator(to_url)){
    console.log("SKIP URL by content type Validator! Looks like it's URL to file: " + to_url);
    return;
  }

  const from_URL = from_url ? new URL(from_url) : null;

  let d1 = new Date();
  const to_URL = new URL(to_url);
  let d2 = new Date();
  saveStat("to_URL", d1, d2, to_url);

  let dom = domain[to_URL.host];
  if (!dom){
    let nd = {};
    nd.cont = 1;
    nd["from_" + nd.cont] = from_url;
    domain[to_URL.host] = nd;
  } else {
    dom.cont = dom.cont+1;
    dom["from_" + dom.cont] = from_url;
    console.log("[" + cnt + ", " + deep + "] " + "SKIP DOUBLE SCAN of " + to_URL.host + " FROM " + from_url);
    return;
  }

  console.log("[" + cnt + ", " + deep + "] " + from_url + " => " + to_url + "  ] =============");
  // console.log("Send request: " + new Date());

  if (deep > maxDeep) {
    console.log("[" + cnt + ", " + deep + "] " + "MaxDeep : " + to_url)
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
      console.log("SKIP content-type : " + contentType + "   FROM " + to_url);
      return;
    }
    parseDeepBody(response.body, from_URL, to_URL, deep);
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


}

function parseBody(body){

  let parser = new htmlparser.Parser({
    onopentag: function(name, attribs){
      console.log("-------------[ " + name + " ]------------");

      if(name === "script"){
        console.log("type: " + attribs.type);
        console.log("src: " + attribs.src);
      } else if(name === "a"){
        console.log("href: " + attribs.href);
      } else if(name === "link"){
        console.log("rel: " + attribs.rel);
        console.log("type: " + attribs.type);
        console.log("href: " + attribs.href);
      } else if(name === "img"){
        console.log("src: " + attribs.src);
      }

      console.log("-----------------------");
    }
    }, {decodeEntities: true});

  parser.write(body);
  parser.end();

}


function parseDeepBody(body, from_URL, to_URL, deep){

  let parser = new htmlparser.Parser({
    onopentag: function(name, attribs){

      if(name === "a"){
        // console.log("href: " + attribs.href);
        if (attribs && attribs.href && attribs.href.length > 4 && attribs.href.startsWith("http") ) {
          let next_URL = new URL(attribs.href);
          if (to_URL.host != next_URL.host){

            let d1 = new Date();
            let val = isWWWValidator(to_URL, next_URL);
            let d2 = new Date();
            saveStat("isWWWValidator", d1, d2, to_URL.host + " vs " + next_URL.host);

            let val2 = false;
            if (!val){
              d1 = new Date();
              val2 = isSubValidator(to_URL, next_URL);
              d2 = new Date();
              saveStat("isSubValidator", d1, d2, to_URL.host + " vs " + next_URL.host);
            }

            if (!val && !val2)
            // if (!val)
              scan(to_URL.href, attribs.href, deep + 1);
            // else
            //   console.log("SKIP: " + to_URL.host + "   ===   " + next_URL.host);
          }
        }
      }
    }
  }, {decodeEntities: true});

  parser.write(body);
  parser.end();

}


function isWWWValidator(URL1, URL2){
  if (URL1.host == URL2.host)
    return false;

  let host1; // small
  let host2; // bigger

  if (URL1.host.length < URL2.host.length){
    host1 = URL1.host;
    host2 = URL2.host;
  } else {
    host1 = URL2.host;
    host2 = URL1.host;
  }

  if (host2.indexOf(host1) == -1)
    return false;

  if (!host2.startsWith("www"))
      return false;

  if (host2 == "www."+host1)
    return true;
  else
    return false;

}

function isSubValidator(URL1, URL2){
  // console.log(URL1.host + " vs " + URL2.host)
  if (URL1.host == URL2.host)
    return false;

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

let statObj = {};

function saveStat(topic, d1, d2, info){
  let delta = d2.getTime() - d1.getTime();
  let curVal = statObj[topic];
  if (!curVal) {
    let o = {};
    o.time = delta;
    o.info = info;
    statObj[topic] = o;
  } else {
    if (delta > curVal.time) {
      curVal.time = delta;
      curVal.info = info;
    }
  }
  // console.log("saveStat: " + topic + " = " + delta);
}

process.on('exit', function() {
  let endTime = new Date();
  console.log("============== exit =====================");
  let delta = endTime.getTime() - startTime.getTime();
  console.log("Uptime is " + delta/1000);
  console.log("===================================");
  // console.log(domain);

  console.log("URLs: " + cntScan + "/" + cnt)
  process.exit(1);
});

process.on('uncaughtException', function() {
  let endTime = new Date();
  console.log("=============== uncaughtException ====================");
  let delta = endTime.getTime() - startTime.getTime();
  console.log("Uptime is " + delta/1000);
  console.log("===================================");
  // console.log(domain);

  console.log("URLs: " + cntScan + "/" + cnt)
  process.exit(1);
});



scan("", "http://1tv.ru", 0);
scan("", "http://yahoo.com", 0);
scan("", "http://cnn.com", 0);
scan("", "http://ya.ru", 0);
scan("", "http://google.com", 0);
scan("", "https://en.wikipedia.org/wiki/List_of_most_popular_websites", 0);
scan("", "http://www.alexa.com/topsites", 0);
scan("", "https://www.redflagnews.com/top-100-conservative/", 0);
