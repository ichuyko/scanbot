# scanbot
It's a test nodejs/mongodb/neo4j/reatcjs app that scan internet and build graph of cross links between sites.



Pre-requirements
=======================================
1. Install nodejs + npm: https://nodejs.org/en/
2. Install https://www.mongodb.com/download-center?jmp=nav#community


Configuration
=======================================
`cd scanbot`

`npm update`



How to run
=======================================
`cd scanbot`

`npm start`








Release notes
=======================================

**v1.1.0**
* store domains to mondoDB

**v1.0.0**
* Added pure nodejs app
* Scan hard coded list of URLs with certain deep
* Show scan progress and some simple result: time, unique URL and logs
* Speed: 4711/1009, 5209/1233, 20657/4772 (uniq URL/sec)
