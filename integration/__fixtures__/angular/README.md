# Angular fixtures

This folder contains packages used in the angular spec file(s).

These packages deviate from real packages in one way: they don't declare a version. The yarn version plugin would pick these up as "packages that need to be versioned" if we added a version. Not declaring a version also means we have to use `*` instead of a version number when declaring peer dependencies.  
In a real repository those packages would have versions and the peer dependencies would list a version or range.
