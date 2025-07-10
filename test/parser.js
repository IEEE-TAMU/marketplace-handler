// sketching out the html parser
const HTMLParser = require("node-html-parser");
const fs = require("node:fs");

const path = "./test/test-2020.html";
const htmlContent = fs.readFileSync(path, "utf-8");
const root = HTMLParser.parse(htmlContent);

const billingDetails = {};
const billingDetailsRaw = root
  .querySelector("#tempOrderBillTo")
  .children.map((tr) => {
    const span = tr.querySelector(".dataLabel");
    return span ? span.text : null;
  }).filter((text) => text !== null);

const billingDetailMapping = ["name", "address", "city_state", "zip", "country"];
billingDetailsRaw.forEach((detail, index) => {
  if (billingDetailMapping[index]) {
    billingDetails[billingDetailMapping[index]] = detail.trim();
  }
});

const orderDetailsRaw = root
  .querySelector("#tempItemDetailsProduct")
  .children.map((tr) => {
    return tr.childNodes.map((td) => (td.text ? td.text.trim() : null));
  });

const orderDetails = {};
const productLine = orderDetailsRaw[1][1];
if (productLine) {
  orderDetails["product"] = productLine.replace(/\s\s+/g, " ").trim();
}
const tShirtLine = orderDetailsRaw[2][1];
if (tShirtLine && tShirtLine.includes("T-Shirt")) {
  const size = tShirtLine.split(":")[1];
  if (size) {
    orderDetails["shirt_size"] = size.trim();
  }
}

const emailNode = root.querySelector("p:contains('Contact Email:')");
let email = null;
if (emailNode) {
  const emailElement =
    emailNode.parentNode.parentNode.nextElementSibling.querySelector(
      ".dataLabel",
    );
  if (emailElement) {
    email = emailElement.text.trim();
  }
}

console.log("Billing Details:", billingDetails);
console.log("Order Details:", orderDetails);
console.log("Email:", email);
