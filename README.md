# scanbot
It's a test nodejs/promise/mongodb app that scan internet and build graph of cross links between sites.



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

**2.5.4**
* move logic to database
* two active QProcessor queue
* Speed Scan: 1960/7733 (uniq URL/sec)
* NetTimeAccess: 5147/7733 67 %


**v1.4.3**
* Handle empty queue
* Add queue monitor for new items
* ref QProcessor with Promise
* ref connection to MongoDB with Promise

**v1.2.1**
* Handle error of IP to Location (version 4/5)

**v1.2.0**
* Add QProcessor - Mongo based priority queue processor
* Fetch the location of each URL using QProcessor

**v1.1.0**
* Store domains to mongoDB

**v1.0.0**
* Added pure nodejs app
* Scan hard coded list of URLs with certain deep
* Show scan progress and some simple result: time, unique URL and logs
* Speed Scan: 4711/1009, 5209/1233, 20657/4772 (uniq URL/sec)
* Speed IP to Location: 100/155 (uniq URL/sec)
