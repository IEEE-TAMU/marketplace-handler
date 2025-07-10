# IEEE TAMU Marketplace Handler

This repo is responsible for connecting the [TAMU Flywire marketplace](https://tamu.estore.flywire.com/) to the [IEEE TAMU Member Portal](https://portal.ieeetamu.org/) for automatic membership/payment tracking. The access that student orgs get to their store in terms of automated observability is quite limited - basically the only automation that can be set up is sending an email anytime an item is purchased.

The general flow is as follows:
1. An membership is purchased on the [IEEE TAMU flywire store](https://tamu.estore.flywire.com/products?storeCatalog=4354) and an email is sent to the inbox monitored by this worker (marketplace-handler@ieeetamu.org).
2. The worker recieves the email, verifies it is from the correct sender, and makes sure the marketplace email contains the correct information. If any of this fails then the email is forwarded for manual review.
3. The worker makes an authenticated request (through use of a shared secret) to the Member Portal - updating the member's payment/membership status automatically.

## Example Email

An example anonymized (originally yours truly's payment) email's body html is located [in the test directory](./test/test-2020.html) to help with testing email parsing - note that this email is from 2020 and more recent emails need to be collected to ensure we parse current emails correctly. The 2020 email also does not have custom fields such as a membership link token that may be helpful to add in the future to assist in automation linking payments to the correct member in the membership portal.

