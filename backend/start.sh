#!/bin/sh
set -e

php artisan migrate --force
# Hanya MovieSeeder. DatabaseSeeder bawaan membuat user dengan kolom "name" yang tidak ada di tabel users.
php artisan db:seed --class=MovieSeeder --force

export PHP_CLI_SERVER_WORKERS=${PHP_CLI_SERVER_WORKERS:-4}
exec php artisan serve --host=0.0.0.0 --port="${PORT:-8000}"
