/**
 * Reference lists of widely used package names, used only for typosquatting-candidate detection.
 * A name being absent from these lists means nothing; a dependency whose name is a near-miss of a
 * listed name (but is not itself listed) is reported as a low-confidence *candidate* for review.
 */
export const POPULAR_NPM = [
  'react', 'react-dom', 'lodash', 'express', 'axios', 'chalk', 'commander', 'debug', 'moment', 'request',
  'tslib', 'typescript', 'webpack', 'babel-core', '@babel/core', 'vue', 'angular', 'jquery', 'underscore',
  'async', 'bluebird', 'uuid', 'yargs', 'minimist', 'glob', 'rimraf', 'mkdirp', 'fs-extra', 'semver',
  'dotenv', 'cross-env', 'colors', 'inquirer', 'body-parser', 'cookie-parser', 'cors', 'helmet', 'morgan',
  'jsonwebtoken', 'bcrypt', 'bcryptjs', 'mongoose', 'mongodb', 'mysql', 'mysql2', 'pg', 'redis', 'ioredis',
  'sequelize', 'knex', 'prisma', 'socket.io', 'ws', 'node-fetch', 'cross-fetch', 'got', 'superagent',
  'eslint', 'prettier', 'jest', 'mocha', 'chai', 'sinon', 'nodemon', 'ts-node', 'next', 'nuxt', 'svelte',
  'rxjs', 'zone.js', 'core-js', 'classnames', 'prop-types', 'styled-components', 'tailwindcss', 'postcss',
  'autoprefixer', 'sass', 'less', 'vite', 'rollup', 'esbuild', 'parcel', 'gulp', 'grunt', 'electron',
  'puppeteer', 'playwright', 'cheerio', 'jsdom', 'marked', 'highlight.js', 'dayjs', 'date-fns', 'luxon',
  'validator', 'joi', 'yup', 'zod', 'ajv', 'qs', 'query-string', 'cookie', 'multer', 'passport',
  'nodemailer', 'winston', 'pino', 'bunyan', 'log4js', 'graphql', 'apollo-server', 'aws-sdk', 'firebase',
  'stripe', 'twilio', 'openai', 'discord.js', 'telegraf', 'crypto-js', 'node-forge', 'ethers', 'web3',
  'sharp', 'jimp', 'canvas', 'pdfkit', 'xlsx', 'papaparse', 'yaml', 'js-yaml', 'xml2js', 'ini', 'toml',
  'event-stream', 'ua-parser-js', 'coa', 'rc', 'node-ipc', 'colors.js', 'faker', 'shelljs', 'execa',
  'cross-spawn', 'which', 'chokidar', 'ora', 'boxen', 'figlet', 'nanoid', 'immer', 'redux', 'react-redux',
  'mobx', 'zustand', 'react-router', 'react-router-dom', 'formik', 'react-hook-form', 'antd', '@mui/material',
  'bootstrap', 'three', 'd3', 'chart.js', 'socket.io-client', 'http-proxy', 'http-server', 'serve',
  'concurrently', 'npm-run-all', 'husky', 'lint-staged', 'typeorm', 'mongodb-memory-server', 'supertest',
];

export const POPULAR_PYPI = [
  'requests', 'urllib3', 'numpy', 'pandas', 'django', 'flask', 'fastapi', 'pydantic', 'sqlalchemy',
  'boto3', 'botocore', 'setuptools', 'wheel', 'pip', 'six', 'python-dateutil', 'pytz', 'pyyaml', 'jinja2',
  'click', 'certifi', 'idna', 'charset-normalizer', 'cryptography', 'pycryptodome', 'paramiko', 'pillow',
  'matplotlib', 'scipy', 'scikit-learn', 'tensorflow', 'torch', 'keras', 'transformers', 'openai',
  'beautifulsoup4', 'lxml', 'selenium', 'scrapy', 'celery', 'redis', 'psycopg2', 'psycopg2-binary',
  'pymongo', 'mysqlclient', 'pymysql', 'gunicorn', 'uvicorn', 'aiohttp', 'httpx', 'websockets', 'pytest',
  'tox', 'black', 'flake8', 'pylint', 'mypy', 'isort', 'colorama', 'termcolor', 'tqdm', 'rich', 'typer',
  'python-dotenv', 'jsonschema', 'attrs', 'marshmallow', 'werkzeug', 'itsdangerous', 'markupsafe',
  'docker', 'kubernetes', 'ansible', 'fabric', 'invoke', 'pyjwt', 'passlib', 'bcrypt', 'discord.py',
  'python-telegram-bot', 'tweepy', 'slack-sdk', 'stripe', 'twilio', 'google-cloud-storage', 'azure-storage-blob',
  'opencv-python', 'nltk', 'spacy', 'gensim', 'xgboost', 'lightgbm', 'seaborn', 'plotly', 'dash', 'streamlit',
  'pyinstaller', 'cython', 'cffi', 'pycparser', 'setuptools-scm', 'poetry', 'virtualenv', 'pipenv',
];

export const POPULAR_PACKAGIST = [
  'laravel/framework', 'symfony/symfony', 'symfony/console', 'symfony/http-foundation', 'guzzlehttp/guzzle',
  'monolog/monolog', 'phpunit/phpunit', 'doctrine/orm', 'twig/twig', 'vlucas/phpdotenv', 'nesbot/carbon',
  'league/flysystem', 'phpmailer/phpmailer', 'firebase/php-jwt', 'ramsey/uuid', 'composer/composer',
];
