import { brand } from './screens';
import { esc, formStatus } from './view';

type LoginOptions = {
  registration: boolean;
  signedIn: boolean;
  remember: boolean;
  showQuickStart: boolean;
  notice: string;
};

export function userLogin({ registration, signedIn, remember, showQuickStart, notice }: LoginOptions) {
  const title = signedIn ? 'Account access' : registration ? 'Create an account' : 'Sign in';
  const status = notice ? '<p class="login-alert" role="alert">' + esc(notice) + '</p>' : '';
  const form = signedIn ? '<button class="button login-submit" type="button" data-action="signout">Sign out</button>' :
    '<form class="login-form" data-form="auth">' +
    '<label for="login-email">Email address<input id="login-email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="name@example.com" required></label>' +
    '<label for="login-password">Password</label>' +
    '<div class="login-password"><input id="login-password" name="password" type="password" autocomplete="' +
    (registration ? 'new-password' : 'current-password') + '" minlength="6" placeholder="' +
    (registration ? 'At least 6 characters' : 'Enter your password') +
    '" required><button type="button" data-action="password-visibility" aria-controls="login-password" aria-label="Show password">Show</button></div>' +
    '<div class="login-options"><label class="check-row"><input type="checkbox" name="remember"' + (remember ? ' checked' : '') + '>Remember me</label>' +
    (!registration ? '<button class="login-link" type="button" data-action="reset">Forgot password?</button>' : '') + '</div>' +
    '<button class="button login-submit" type="submit">' + (registration ? 'Create account' : 'Sign in') + '</button>' + formStatus() + '</form>';

  const alternate = !signedIn ? '<p class="login-alternate">' + (registration ? 'Already have an account?' : 'New to Qoption?') +
    ' <button type="button" class="login-link" data-action="registration">' + (registration ? 'Sign in' : 'Create an account') + '</button></p>' : '';
  const quickStartLink = showQuickStart && !signedIn
    ? '<button class="button secondary login-quick-start" data-action="quick-start" type="button">Open practice workspace</button>' : '';

  return '<main class="login-page"><section class="login-access" aria-labelledby="login-title">' +
    '<div class="login-card"><div class="login-brand">' + brand + '</div><header class="login-heading"><h1 id="login-title">' + title + '</h1>' +
    '<p>' + (registration ? 'Start with a practice account.' : 'Access your workspace, practice wallet and trade history.') + '</p></header>' +
    status + form + alternate + quickStartLink + '<p id="auth-notice" class="form-status" role="status"></p>' +
    '<footer class="login-footer"><a href="/home.html">Home</a><a href="/admin/">Staff sign-in</a></footer></div></section>' +
    '<section class="login-market" aria-labelledby="login-market-title"><div class="login-market-content">' +
    '<h2 id="login-market-title">A clearer view of the market.</h2><p>Follow crypto prices and practice trades with practice credits.</p>' +
    '<div class="login-chart-card"><div class="login-chart-heading"><span class="login-ticker">BTC<span>/USDT</span></span>' +
    '<span id="login-chart-status">Simulated chart</span></div>' +
    '<canvas id="login-chart" class="chart" aria-label="Sample Bitcoin line chart using simulated prices"></canvas>' +
    (!signedIn ? '<div class="login-chart-footer"><button class="login-link" data-action="guest-market" type="button">Explore live markets</button></div>' : '') +
    '</div></div></section></main>';
}
