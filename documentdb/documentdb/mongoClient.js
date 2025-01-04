// Database Name
const { MongoClient, ServerApiVersion } = require('mongodb');
const dotenv = require("dotenv").config();

const uri = `${dotenv.parsed.MONGO_DRIVER}${dotenv.parsed.MONGO_URI}${dotenv.parsed.MONGO_QUERY_PARAM}`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function connectToMongoClient() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 }).finally(() => console.log("Connected to MongoDB!"));
    } finally {
        // Ensures that the client will close when you finish/error
        await client.close();
    }
}

module.exports = connectToMongoClient;