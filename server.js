// Dependencies

var express = require("express");
var method = require("method-override");
var body = require("body-parser");
var exphbs = require("express-handlebars");
var mongoose = require("mongoose");
var logger = require("morgan");
var cheerio = require("cheerio");
var request = require("request");
var axios = require("axios");

// Mongoose

var Note = require("./models/note");
var Article = require("./models/article");
var databaseUrl = "mongodb://localhost/scrap";

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI);
} else {
  mongoose.connect(databaseUrl);
}

mongoose.Promise = Promise;
var db = mongoose.connection;

db.on("error", function(error) {
  console.log("Mongoose Error: ", error);
});

db.once("open", function() {
  console.log("Mongoose connection successful.");
});

var app = express();
var port = process.env.PORT || 3000;

// app set-ups

app.use(logger("dev"));
app.use(express.static("public"));
app.use(body.urlencoded({ extended: false }));
app.use(method("_method"));
app.engine("handlebars", exphbs({ defaultLayout: "main" }));
app.set("view engine", "handlebars");

app.listen(port, function() {
  console.log("Listening on port " + port);
});

// Routes

app.get("/", function(req, res) {
  Article.find({}, null, { sort: { created: -1 } }, function(err, data) {
    if (data.length === 0) {
      res.render("placeholder", {
        message:
          'There\'s nothing scraped yet. Please click "Scrape For Newest Articles" for fresh and delicious news.'
      });
    } else {
      res.render("index", { articles: data });
    }
  });
});

app.get("/scrape", function(req, res) {
  axios.get("https://www.nytimes.com/section/world").then(function(response) {
    var $ = cheerio.load(response.data);
    var result = {};
    $("article").each(function(i, element) {
      result.title = $(this)
        .children("h2")
        .text();
      result.link = $(this)
        .children("a")
        .attr("href");

      if (summary) {
        result.summary = $(this)
          .children("p")
          .text();
      }
      if (img) {
        result.img = $(this)
          .children("figure")
          .attr("src");
      } else {
        result.img = $(element)
          .find(".wide-thumb")
          .find("img")
          .attr("src");
      }

      // Create a new Article using the `result` object built from scraping
      db.Article.create(result)
        .then(function(dbArticle) {
          // View the added result in the console
          console.log(dbArticle);
        })
        .catch(function(err) {
          // If an error occurred, log it
          console.log(err);
        });
    });

    // Send a message to the client
    res.send("Scrape Complete");
  });
});

app.get("/saved", function(req, res) {
  Article.find({ issaved: true }, null, { sort: { created: -1 } }, function(
    err,
    data
  ) {
    if (data.length === 0) {
      res.render("placeholder", {
        message:
          'You have not saved any articles yet. Try to save some delicious news by simply clicking "Save Article"!'
      });
    } else {
      res.render("saved", { saved: data });
    }
  });
});

app.get("/:id", function(req, res) {
  Article.findById(req.params.id, function(err, data) {
    res.json(data);
  });
});

app.post("/search", function(req, res) {
  console.log(req.body.search);
  Article.find(
    { $text: { $search: req.body.search, $caseSensitive: false } },
    null,
    { sort: { created: -1 } },
    function(err, data) {
      console.log(data);
      if (data.length === 0) {
        res.render("placeholder", {
          message: "Nothing has been found. Please try other keywords."
        });
      } else {
        res.render("search", { search: data });
      }
    }
  );
});

app.post("/save/:id", function(req, res) {
  Article.findById(req.params.id, function(err, data) {
    if (data.issaved) {
      Article.findByIdAndUpdate(
        req.params.id,
        { $set: { issaved: false, status: "Save Article" } },
        { new: true },
        function(err, data) {
          res.redirect("/");
        }
      );
    } else {
      Article.findByIdAndUpdate(
        req.params.id,
        { $set: { issaved: true, status: "Saved" } },
        { new: true },
        function(err, data) {
          res.redirect("/saved");
        }
      );
    }
  });
});

app.post("/note/:id", function(req, res) {
  var note = new Note(req.body);
  note.save(function(err, doc) {
    if (err) throw err;
    Article.findByIdAndUpdate(
      req.params.id,
      { $set: { note: doc._id } },
      { new: true },
      function(err, newdoc) {
        if (err) throw err;
        else {
          res.send(newdoc);
        }
      }
    );
  });
});

app.get("/note/:id", function(req, res) {
  var id = req.params.id;
  Article.findById(id)
    .populate("note")
    .exec(function(err, data) {
      res.send(data.note);
    });
});
