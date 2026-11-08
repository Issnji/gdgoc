<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Movie extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'title', 'year', 'director', 'genres', 'rating',
        'duration', 'synopsis', 'poster_url', 'cast',
    ];

    protected function casts(): array
    {
        return ['genres' => 'array', 'cast' => 'array', 'rating' => 'decimal:1'];
    }

    public function watchlists(): HasMany { return $this->hasMany(Watchlist::class); }
    public function reviews(): HasMany { return $this->hasMany(Review::class); }
}
