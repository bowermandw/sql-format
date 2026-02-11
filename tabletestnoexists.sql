drop table 
dbo.some_table;
go
create table dbo.some_table (id NOT NULL identity(1,1), column1 varchar(20) NOT NULL, column2 varchar(30) NULL, column3 varchar(40) NULL) on primary
go