<?php

namespace Database\Seeders;

use App\Models\Movie;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;
use RuntimeException;

class MovieSeeder extends Seeder
{
    public function run(): void
    {
        $path = database_path('data/movies.json');
        if (!File::exists($path)) {
            throw new RuntimeException(
                'Dataset tidak ditemukan. Salin data/movies.json dari starter pack ke database/data/movies.json.'
            );
        }

        $movies = json_decode(File::get($path), true, flags: JSON_THROW_ON_ERROR);
        foreach ($movies as $movie) {
            Movie::updateOrCreate(['id' => $movie['id']], [
                'title' => $movie['title'],
                'year' => $movie['year'],
                'director' => $movie['director'],
                'genres' => $movie['genres'],
                'rating' => $movie['rating'] ?? null,
                'duration' => $movie['duration'] ?? null,
                'synopsis' => $movie['synopsis'],
                'poster_url' => $movie['poster_url'] ?? null,
                'cast' => $movie['cast'] ?? [],
            ]);
        }
    }
}
