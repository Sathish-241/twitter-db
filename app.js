const express = require("express");
const app = express();
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error:${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "my_secret_token", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.tweet = tweet;
        request.tweetId = tweetId;

        next();
      }
    });
  }
};

// Register User API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `INSERT INTO user (username,password,name,gender)VALUES(
            '${username}','${hashedPassword}','${name}','${gender}'
        );`;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// Login user API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT *  FROM user WHERE username='${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    request.status(400);
    request.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "my_secret_token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//  User Tweets API 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  //   const { payload } = request;
  const { username } = request;
  const getUserIdQuery = `SELECT user_id AS userId  FROM user WHERE username='${username}'`;
  const getUser = await db.get(getUserIdQuery);
  //console.log(getUser.userId);

  const getTweetsQuery = `SELECT username,
                                      tweet,
                                      date_time AS dateTime
                                      FROM  follower JOIN  tweet ON  follower.following_user_id=tweet.user_id JOIN user ON user.user_id=follower.following_user_id
                                      WHERE follower.following_user_id= ${getUser.userId}
                                      ORDER BY date_time DESC
                                      LIMIT 4;`;
  const userTweets = await db.all(getTweetsQuery);
  response.send(userTweets);
});

//  Get User Followers API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  //    const { payload } = request;
  const { username } = request;
  const getUserIdQuery = `SELECT user_id AS userId  FROM user WHERE username='${username}'`;
  const getUser = await db.get(getUserIdQuery);
  console.log(getUser);
  const getUserFollowsQuery = `SELECT  name FROM user JOIN follower ON user.user_id=follower.following_user_id
   WHERE follower.follower_user_id=${getUser.userId}`;
  const followersArray = await db.all(getUserFollowsQuery);
  response.send(followersArray);
});

//  Get User Following API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  //    const { payload } = request;
  const { username } = request;
  const getUserIdQuery = `SELECT user_id AS userId  FROM user WHERE username='${username}'`;
  const getUser = await db.get(getUserIdQuery);
  const getFollowingUserQuery = `SELECT DISTINCT name FROM user JOIN follower ON user.user_id=follower.follower_user_id
   WHERE follower.following_user_id=${getUser.userId};`;
  const followingArray = await db.all(getFollowingUserQuery);
  response.send(followingArray);
});

//  Get Tweet API 6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request;
  //   console.log(tweetId);
  const selectUserQuery = `SELECT user_id AS userId FROM user WHERE username='${username}'`;
  const getUser = await db.get(selectUserQuery);
  const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId}`;
  const tweetResults = await db.get(tweetsQuery);
  const userFollowerQuery = `SELECT *  FROM user JOIN follower ON user.user_id=follower.following_user_id
                                WHERE follower.follower_user_id=${getUser.userId};`;
  const userFollowers = await db.all(userFollowerQuery);
  if (
    userFollowers.some(
      (item) => item.following_user_id === tweetResults.user_id
    )
  ) {
    // console.log(tweetResults);
    // console.log("-------------------");
    // console.log(userFollowers);
    const getTweetDetailsQuery = `SELECT tweet,
                                            COUNT(DISTINCT like.like_id)AS likes,
                                            COUNT(DISTINCT reply.reply_id)AS replies,
                                            tweet.date_time AS dateTime 
                                            FROM tweet JOIN like ON tweet.tweet_id=like.tweet_id JOIN reply ON tweet.tweet_id=reply.tweet_id
                                            WHERE tweet.tweet_id=${tweetId};`;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//  Get Liked User API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request;
    const selectUserQuery = `SELECT user_id AS userId FROM user WHERE username='${username}'`;
    const getUser = await db.get(selectUserQuery);
    const getLikedUserQuery = `SELECT * FROM follower JOIN tweet ON tweet.user_id=follower.following_user_id JOIN like ON like.tweet_id=tweet.tweet_id
                                            JOIN user ON user.user_id=like.user_id
                                        WHERE tweet.tweet_id=${tweetId} AND follower.follower_user_id=${getUser.userId};`;
    const likedUsers = await db.all(getLikedUserQuery);
    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//  Get Tweet Replies API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request;
    const selectUserQuery = `SELECT user_id AS userId FROM user WHERE username='${username}'`;
    const getUser = await db.get(selectUserQuery);
    const getRepliedUserQuery = `SELECT * FROM follower JOIN tweet ON tweet.user_id=follower.following_user_id JOIN reply ON reply.tweet_id=tweet.tweet_id
                                            JOIN user ON user.user_id=reply.user_id
                                        WHERE tweet.tweet_id=${tweetId} AND follower.follower_user_id=${getUser.userId};`;
    const repliedUsers = await db.all(getRepliedUserQuery);
    if (repliedUsers.length !== 0) {
      let replies = [];
      const getRepliesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getRepliesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//  Get all Tweets API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request;
  const selectUserQuery = `SELECT user_id AS userId FROM user WHERE username='${username}'`;
  const getUser = await db.get(selectUserQuery);
  const getAllTweetsQuery = `SELECT tweet.tweet,
                                        COUNT(DISTINCT like.like_id)AS likes,
                                        COUNT(DISTINCT reply.reply_id)AS replies,
                                        tweet.date_time AS dateTime
                                        FROM user JOIN tweet ON user.user_id=tweet.user_id JOIN like ON  like.tweet_id=tweet.tweet_id JOIN  reply ON  reply.tweet_id=tweet.tweet_id
                                        WHERE user.user_id=${getUser.userId}
                                        GROUP BY tweet.tweet_id;`;
  const tweetDetails = await db.all(getAllTweetsQuery);
  response.send(tweetDetails);
});

//  Create Tweet API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request;
  const selectUserQuery = `SELECT user_id AS userId FROM user WHERE username='${username}'`;
  const getUser = await db.get(selectUserQuery);
  const createTweetQuery = `INSERT INTO tweet (tweet,user_id)VALUES('${tweet}',${getUser.userId});`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

// Delete Tweet  API 11

app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request;
  const selectUserQuery = `SELECT user_id AS userId FROM user WHERE username='${username}'`;
  const getUser = await db.get(selectUserQuery);
  const getUserQuery = `SELECT * FROM tweet WHERE tweet.user_id=${getUser.userId} AND tweet.tweet_id=${tweetId};`;
  const tweetUser = await db.all(getUserQuery);
  if (tweetUser.length !== 0) {
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet.tweet_id=${tweetId} AND tweet.user_id=${getUser.userId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
